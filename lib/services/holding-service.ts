import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRateWithMeta } from '@/lib/api/exchange-rate'
import {
    cacheGet,
    cacheSet,
    cacheDelete,
    stockPriceKey,
    PRICE_CACHE_TTL_SECONDS,
    type PriceCacheEntry,
} from '@/lib/cache'
import Decimal from 'decimal.js'

// 가격 조회: 우선 Redis(stock:price:{code}) → 미스 시 KIS 직접 호출.
// cron 미실행 / 캐시 만료 / 신규 보유 종목 등 어떤 상태에서도 동작 보장.
async function fetchCurrentPrice(stockCode: string, market: string): Promise<number> {
    const cached = await cacheGet<PriceCacheEntry>(stockPriceKey(stockCode))
    if (cached && Number.isFinite(cached.price) && cached.price > 0) {
        return cached.price
    }

    try {
        let marketType: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI'
        if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS') {
            marketType = 'US'
        } else if (market === 'KOSDAQ' || market === 'KQ') {
            marketType = 'KOSDAQ'
        }

        const priceData = await kisClient.getCurrentPrice(stockCode, marketType)
        if (Number.isFinite(priceData.price) && priceData.price > 0) {
            const entry: PriceCacheEntry = {
                price: priceData.price,
                currency: marketType === 'US' ? 'USD' : 'KRW',
                change: priceData.change ?? 0,
                changeRate: priceData.changeRate ?? 0,
                updatedAt: new Date().toISOString(),
            }
            await cacheSet(stockPriceKey(stockCode), entry, PRICE_CACHE_TTL_SECONDS)
        }
        return priceData.price
    } catch (e) {
        console.warn(`Failed to fetch price for ${stockCode}:`, e)
        return 0
    }
}

// 환율 조회는 lib/api/exchange-rate.ts 의 L1(in-memory) → L2(Redis) → sources
// 계층화된 캐시를 그대로 위임한다.

// Redis-backed TTL cache for getList — 탭 전환/재진입 시 KIS 가격 조회와
// DB 보유 종목 조회를 재실행하지 않고 결과 재사용. Mutation 시 invalidate() 호출.
// 이전 in-memory Map은 Vercel Serverless에서 인스턴스간 공유 안 되어 효과 미미했음.
//
// TTL 5초: 60초가 너무 길어 worker 가 실시간으로 갱신한 stock:price 캐시(L2)가
// 새로고침에 반영되지 않는 문제가 있었다. 5초면 연타 탭 전환은 캐시 히트(빠른 응답)
// 유지, 명시적 새로고침은 L2 의 신선한 가격을 거의 항상 받는다.
// 변이(보유 추가/삭제/예수금 등)는 invalidate() 가 즉시 무효화하므로 stale 위험 없음.
const HOLDINGS_CACHE_TTL_SECONDS = 5
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
                    include: { stock: true, account: { select: { id: true, name: true } } },
                    orderBy: { createdAt: 'asc' },
                }),
                prisma.user.findUnique({
                    where: { id: userId },
                    select: { cashBalance: true, cashAccounts: true, targetAsset: true }
                })
            ])

            const cashBalance = user?.cashBalance ? new Decimal(user.cashBalance.toString()) : new Decimal(0)
            const targetAsset = user?.targetAsset ? new Decimal(user.targetAsset.toString()) : new Decimal(0)
            // cashAccounts 는 JSON 컬럼 — null/legacy 사용자는 빈 배열로 정규화.
            const cashAccounts = Array.isArray(user?.cashAccounts) ? user.cashAccounts : null

            // Fetch FX rate and per-stock prices in a single parallel batch.
            // 둘 다 내부적으로 Redis(공유 캐시) 우선 조회 후 미스 시 직접 호출 —
            // cron 이 갱신해 둔 캐시 히트 시 외부 API 호출 0건으로 응답 가능.
            const fxPromise = getUsdExchangeRateWithMeta()

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
                    engName: holding.stock.engName ?? null,
                    market: holding.stock.market,
                    accountId: holding.accountId,
                    accountName: holding.account?.name ?? null,
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
                    _stockId: holding.stockId,
                    _shouldUpdateDb: fetchedPrice > 0 && !new Decimal(fetchedPrice).equals(storedPrice),
                    _fetchedPrice: fetchedPrice,
                }
            }))

            const [fxMeta, holdingsWithPriceRaw] = await Promise.all([fxPromise, pricesPromise])
            const exchangeRate = fxMeta.rate
            const exchangeRateUpdatedAt = fxMeta.updatedAt
            const exRate = new Decimal(exchangeRate || 0)

            // 시세 변동분만 모아 한 번에 update — N+1 race 회피.
            // 같은 stockId 의 모든 Holding row(여러 계좌에 분산되어 있을 수 있음)에 동일 가격 반영.
            // 동일 stockId 가 여러 행에 있으면 첫 항목만 picking 해 stockId 단위 update 발행.
            const seenStockIds = new Set<string>()
            const updates = holdingsWithPriceRaw
                .filter(h => h._shouldUpdateDb)
                .filter(h => {
                    if (seenStockIds.has(h._stockId)) return false
                    seenStockIds.add(h._stockId)
                    return true
                })
                .map(h =>
                    prisma.holding.updateMany({
                        where: { stockId: h._stockId },
                        data: { currentPrice: h._fetchedPrice, priceUpdatedAt: new Date() },
                    })
                )
            if (updates.length > 0) {
                // 응답 latency를 늘리지 않도록 await 하지 않고 fire-and-forget — 실패해도 다음 요청에서 다시 시도
                // Promise.allSettled 는 reject 하지 않으므로 .catch() 는 dead code. then() 안에서 실패 항목만 로그.
                Promise.allSettled(updates).then((results) => {
                    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
                    if (failed.length > 0) {
                        console.warn(
                            `[HoldingService] 배경 가격 업데이트 ${failed.length}/${results.length} 실패`,
                            failed.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason))),
                        )
                    }
                })
            }

            // 응답 필드만 남기고 메타 필드는 제거
            const holdingsWithPrice = holdingsWithPriceRaw.map(({ _holdingId, _stockId, _shouldUpdateDb, _fetchedPrice, ...rest }) => rest)

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
                        exchangeRateUpdatedAt,
                        cashBalance: cashBalance.toNumber(),
                        cashAccounts,
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
