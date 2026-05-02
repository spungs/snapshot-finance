import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'

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

// In-memory TTL cache for getList — same userId hitting home/portfolio in quick
// succession (e.g., tab switching) reuses the result instead of re-running KIS calls.
// Stored value is the full success response; mutations call invalidate() below.
const HOLDINGS_CACHE_TTL_MS = 10_000
type HoldingsListResult = Awaited<ReturnType<typeof computeList>>
const holdingsCache = new Map<string, { data: HoldingsListResult; expiresAt: number }>()

async function computeList(userId: string) {
    return holdingServiceInternal._compute(userId)
}

export const holdingService = {
    /** Drop the cached holdings result for a user. Call after any mutation that
     *  affects holdings, cashBalance, or targetAsset so the next read reflects it. */
    invalidate(userId: string) {
        holdingsCache.delete(userId)
    },

    async getList(userId: string) {
        const cached = holdingsCache.get(userId)
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data
        }

        const result = await computeList(userId)

        // Only cache successful responses; failures should retry on next request
        if (result?.success) {
            holdingsCache.set(userId, {
                data: result,
                expiresAt: Date.now() + HOLDINGS_CACHE_TTL_MS,
            })
        }

        return result
    },
}

// Internal compute fn split out so the cache wrapper above stays minimal.
const holdingServiceInternal = {
    async _compute(userId: string) {
        try {
            const holdings = await prisma.holding.findMany({
                where: { userId },
                include: { stock: true },
                orderBy: { displayOrder: 'asc' },
            })

            // Fetch User Cash Balance
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { cashBalance: true, targetAsset: true }
            })

            const cashBalance = user?.cashBalance ? Number(user.cashBalance) : 0
            const targetAsset = user?.targetAsset ? Number(user.targetAsset) : 0

            // Fetch FX rate and per-stock prices in a single parallel batch.
            // — `getCurrentPrice` already de-dupes the KIS token fetch via tokenPromise,
            //   so a separate `ensureConnection()` priming step is redundant.
            // — FX call is independent of stock prices, so running them serially
            //   (the previous structure) just stacked latency.
            const fxPromise = getUsdExchangeRate()

            const pricesPromise = Promise.all(holdings.map(async (holding) => {
                let currentPrice = 0
                try {
                    currentPrice = await fetchCurrentPrice(holding.stock.stockCode, holding.stock.market || 'Unknown')
                    if (isNaN(currentPrice)) currentPrice = 0

                    // Update DB if price changed (Async side-effect)
                    if (currentPrice > 0 && currentPrice !== Number(holding.currentPrice)) {
                        await prisma.holding.update({
                            where: { id: holding.id },
                            data: {
                                currentPrice,
                                priceUpdatedAt: new Date()
                            }
                        })
                    }
                } catch (e) {
                    console.warn(`Price fetch failed for ${holding.stock.stockName}`, e)
                    // Do NOT reset currentPrice to 0 here if we want to fallback
                    // But if fetch failed, currentPrice remains 0 from initialization
                }

                // Fallback to DB price if fetch failed
                let displayPrice = currentPrice
                let priceTimestamp = new Date() // Default to now if fetched

                if (displayPrice === 0 && Number(holding.currentPrice) > 0) {
                    displayPrice = Number(holding.currentPrice)
                    priceTimestamp = holding.priceUpdatedAt || new Date() // Use stored timestamp
                }

                const totalCost = Number(holding.averagePrice) * holding.quantity
                const currentValue = displayPrice * holding.quantity
                const profit = currentValue - totalCost
                const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0
                const currency = holding.currency || 'KRW'

                return {
                    id: holding.id,
                    stockId: holding.stockId,
                    stockCode: holding.stock.stockCode,
                    stockName: holding.stock.stockName,
                    market: holding.stock.market,
                    quantity: holding.quantity,
                    averagePrice: Number(holding.averagePrice),
                    currentPrice: displayPrice,
                    currency,
                    purchaseRate: Number(holding.purchaseRate),
                    priceUpdatedAt: priceTimestamp,
                    totalCost,
                    currentValue,
                    profit,
                    profitRate,
                }
            }))

            const [exchangeRate, holdingsWithPrice] = await Promise.all([fxPromise, pricesPromise])

            // Calculate Total Summary (KRW Base)
            let totalCostKRW = 0
            let totalStockValueKRW = 0 // 주식 평가금액만

            holdingsWithPrice.forEach(h => {
                if (h.currency === 'USD') {
                    // 매입금액은 매입 시점 환율로 동결 (시간이 지나도 변하지 않아야 함)
                    // purchaseRate 누락/legacy(1)면 현재 환율로 폴백
                    const effectivePurchaseRate = h.purchaseRate && h.purchaseRate !== 1 ? h.purchaseRate : exchangeRate
                    totalCostKRW += h.totalCost * effectivePurchaseRate
                    totalStockValueKRW += h.currentValue * exchangeRate
                } else {
                    totalCostKRW += h.totalCost
                    totalStockValueKRW += h.currentValue
                }
            })

            // 총 자산 = 주식 평가금액 + 예수금
            const totalValueKRW = totalStockValueKRW + cashBalance
            const totalProfit = totalStockValueKRW - totalCostKRW // 주식 투자 손익만 계산 (예수금은 변동 없으므로)
            const totalProfitRate = totalCostKRW > 0 ? (totalProfit / totalCostKRW) * 100 : 0

            return {
                success: true,
                data: {
                    holdings: holdingsWithPrice,
                    summary: {
                        totalCost: totalCostKRW,
                        totalValue: totalValueKRW, // 주식 + 예수금
                        totalStockValue: totalStockValueKRW, // 주식만 (Optional, but useful)
                        totalProfit: totalProfit,
                        totalProfitRate: totalProfitRate,
                        holdingsCount: holdingsWithPrice.length,
                        exchangeRate,
                        cashBalance, // FE에서 표시할 수 있게 전달
                        targetAsset,
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
