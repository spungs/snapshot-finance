import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { cacheGet, cacheSet, cacheDelete } from '@/lib/cache'
import Decimal from 'decimal.js'

// Helper function to fetch current price (KIS API)
async function fetchCurrentPrice(stockCode: string, market: string): Promise<number> {
    try {
        let marketType: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI'
        if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS') {
            marketType = 'US'
        } else if (market === 'KOSDAQ' || market === 'KQ') {
            marketType = 'KOSDAQ'
        }

        const priceData = await kisClient.getCurrentPrice(stockCode, marketType)
        return priceData.price
    } catch (e) {
        console.warn(`Failed to fetch price for ${stockCode}:`, e)
        return 0
    }
}

// Redis-backed TTL cache for getList — 빠른 연속 요청(탭 전환 등) 시
// KIS 가격 조회를 재실행하지 않고 결과 재사용. Mutation 시 invalidate() 호출.
// 이전 in-memory Map은 Vercel Serverless에서 인스턴스간 공유 안 되어 효과 미미했음.
const HOLDINGS_CACHE_TTL_SECONDS = 10
const holdingsCacheKey = (userId: string) => `holdings:list:${userId}`

type HoldingsListResult = Awaited<ReturnType<typeof computeList>>

async function computeList(userId: string) {
    return holdingServiceInternal._compute(userId)
}

export const holdingService = {
    /** Drop the cached holdings result for a user. Call after any mutation that
     *  affects holdings, cashBalance, or targetAsset so the next read reflects it. */
    async invalidate(userId: string) {
        await cacheDelete(holdingsCacheKey(userId))
    },

    async getList(userId: string) {
        const key = holdingsCacheKey(userId)
        const cached = await cacheGet<HoldingsListResult>(key)
        if (cached) {
            return cached
        }

        const result = await computeList(userId)

        // Only cache successful responses; failures should retry on next request
        if (result?.success) {
            await cacheSet(key, result, HOLDINGS_CACHE_TTL_SECONDS)
        }

        return result
    },
}

// Internal compute fn split out so the cache wrapper above stays minimal.
const holdingServiceInternal = {
    async _compute(userId: string) {
        try {
            // holdings·user를 한 번에 — 별개의 await 두 번을 묶어 round trip 절감
            const [holdings, user] = await Promise.all([
                prisma.holding.findMany({
                    where: { userId },
                    include: { stock: true },
                    orderBy: { createdAt: 'asc' },
                }),
                prisma.user.findUnique({
                    where: { id: userId },
                    select: { cashBalance: true, targetAsset: true }
                })
            ])

            const cashBalance = user?.cashBalance ? new Decimal(user.cashBalance.toString()) : new Decimal(0)
            const targetAsset = user?.targetAsset ? new Decimal(user.targetAsset.toString()) : new Decimal(0)

            // Fetch FX rate and per-stock prices in a single parallel batch.
            // — `getCurrentPrice` already de-dupes the KIS token fetch via tokenPromise,
            //   so a separate `ensureConnection()` priming step is redundant.
            // — FX call is independent of stock prices, so running them serially
            //   (the previous structure) just stacked latency.
            const fxPromise = getUsdExchangeRate()

            // 개별 종목 시세를 병렬로 가져온다. 시세→DB write 부작용은
            // 본 GET 핸들러에서 분리해 한 번에 묶어서 처리한다 (race + GET-side-effect 회피).
            const pricesPromise = Promise.all(holdings.map(async (holding) => {
                let fetchedPrice = 0
                try {
                    fetchedPrice = await fetchCurrentPrice(holding.stock.stockCode, holding.stock.market || 'Unknown')
                    if (!Number.isFinite(fetchedPrice)) fetchedPrice = 0
                } catch (e) {
                    console.warn(`Price fetch failed for ${holding.stock.stockName}`, e)
                }

                const storedPrice = new Decimal(holding.currentPrice.toString())

                // Fallback: 시세 조회 실패 시 DB에 저장된 마지막 가격 사용
                let displayPrice: Decimal
                let priceTimestamp: Date
                if (fetchedPrice > 0) {
                    displayPrice = new Decimal(fetchedPrice)
                    priceTimestamp = new Date()
                } else if (storedPrice.gt(0)) {
                    displayPrice = storedPrice
                    priceTimestamp = holding.priceUpdatedAt || new Date()
                } else {
                    displayPrice = new Decimal(0)
                    priceTimestamp = new Date()
                }

                const quantity = new Decimal(holding.quantity)
                const averagePrice = new Decimal(holding.averagePrice.toString())
                const purchaseRate = new Decimal(holding.purchaseRate.toString())

                const totalCost = averagePrice.times(quantity)
                const currentValue = displayPrice.times(quantity)
                const profit = currentValue.minus(totalCost)
                const profitRate = totalCost.isZero() ? new Decimal(0) : profit.div(totalCost).times(100)

                return {
                    id: holding.id,
                    stockId: holding.stockId,
                    stockCode: holding.stock.stockCode,
                    stockName: holding.stock.stockName,
                    market: holding.stock.market,
                    quantity: holding.quantity,
                    averagePrice: averagePrice.toNumber(),
                    currentPrice: displayPrice.toNumber(),
                    currency: holding.currency || 'KRW',
                    purchaseRate: purchaseRate.toNumber(),
                    priceUpdatedAt: priceTimestamp,
                    totalCost: totalCost.toNumber(),
                    currentValue: currentValue.toNumber(),
                    profit: profit.toNumber(),
                    profitRate: profitRate.toNumber(),
                    // 부작용 처리용 메타 — 응답에는 포함하지 않는다
                    _holdingId: holding.id,
                    _shouldUpdateDb: fetchedPrice > 0 && !new Decimal(fetchedPrice).equals(storedPrice),
                    _fetchedPrice: fetchedPrice,
                }
            }))

            const [exchangeRate, holdingsWithPriceRaw] = await Promise.all([fxPromise, pricesPromise])
            const exRate = new Decimal(exchangeRate || 0)

            // 시세 변동분만 모아 한 번에 update — N+1 race 회피
            const updates = holdingsWithPriceRaw
                .filter(h => h._shouldUpdateDb)
                .map(h =>
                    prisma.holding.update({
                        where: { id: h._holdingId },
                        data: { currentPrice: h._fetchedPrice, priceUpdatedAt: new Date() },
                    })
                )
            if (updates.length > 0) {
                // 응답 latency를 늘리지 않도록 await 하지 않고 fire-and-forget — 실패해도 다음 요청에서 다시 시도
                Promise.allSettled(updates).catch(() => { })
            }

            // 응답 필드만 남기고 메타 필드는 제거
            const holdingsWithPrice = holdingsWithPriceRaw.map(({ _holdingId, _shouldUpdateDb, _fetchedPrice, ...rest }) => rest)

            // KRW 기준 합계 계산 — Decimal 누적
            let totalCostKRW = new Decimal(0)
            let totalStockValueKRW = new Decimal(0)

            for (const h of holdingsWithPrice) {
                const cost = new Decimal(h.totalCost)
                const value = new Decimal(h.currentValue)
                if (h.currency === 'USD') {
                    // 매입금액은 매입 시점 환율로 동결 (purchaseRate 누락/legacy(1)면 현재 환율로 폴백)
                    const effectivePurchaseRate = h.purchaseRate && h.purchaseRate !== 1
                        ? new Decimal(h.purchaseRate)
                        : exRate
                    totalCostKRW = totalCostKRW.plus(cost.times(effectivePurchaseRate))
                    totalStockValueKRW = totalStockValueKRW.plus(value.times(exRate))
                } else {
                    totalCostKRW = totalCostKRW.plus(cost)
                    totalStockValueKRW = totalStockValueKRW.plus(value)
                }
            }

            // 총 자산 = 주식 평가금액 + 예수금. 손익은 주식 부분만(예수금은 평가차이 없음).
            const totalValueKRW = totalStockValueKRW.plus(cashBalance)
            const totalProfit = totalStockValueKRW.minus(totalCostKRW)
            const totalProfitRate = totalCostKRW.isZero()
                ? new Decimal(0)
                : totalProfit.div(totalCostKRW).times(100)

            return {
                success: true,
                data: {
                    holdings: holdingsWithPrice,
                    summary: {
                        totalCost: totalCostKRW.toNumber(),
                        totalValue: totalValueKRW.toNumber(),
                        totalStockValue: totalStockValueKRW.toNumber(),
                        totalProfit: totalProfit.toNumber(),
                        totalProfitRate: totalProfitRate.toNumber(),
                        holdingsCount: holdingsWithPrice.length,
                        exchangeRate,
                        cashBalance: cashBalance.toNumber(),
                        targetAsset: targetAsset.toNumber(),
                    },
                },
            }
        } catch (error) {
            console.error('Holdings service error:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return {
                success: false,
                error: {
                    code: 'FETCH_FAILED',
                    message: `잔고 조회 실패: ${errorMessage}`
                }
            }
        }
    }
}
