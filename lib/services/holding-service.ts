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

export const holdingService = {
    async getList(userId: string) {
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

            // Fetch Exchange Rate and ensure KIS connection in parallel
            const [exchangeRate] = await Promise.all([
                getUsdExchangeRate(),
                kisClient.ensureConnection()
            ])

            // Fetch Real-time Prices and Calculate Summary
            const holdingsWithPrice = await Promise.all(holdings.map(async (holding) => {
                let currentPrice = 0
                try {
                    // Fetch Real-time Price
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

            // Calculate Total Summary (KRW Base)
            let totalCostKRW = 0
            let totalStockValueKRW = 0 // 주식 평가금액만

            holdingsWithPrice.forEach(h => {
                if (h.currency === 'USD') {
                    totalCostKRW += h.totalCost * exchangeRate
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
