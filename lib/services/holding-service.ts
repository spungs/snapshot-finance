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
        console.error(`Failed to fetch price for ${stockCode}:`, e)
        return 0
    }
}

export const holdingService = {
    async getList(userId: string) {
        try {
            const account = await prisma.securitiesAccount.findFirst({
                where: { userId },
            })

            if (!account) {
                return { success: true, data: { holdings: [], summary: null } }
            }

            const holdings = await prisma.holding.findMany({
                where: { accountId: account.id },
                include: { stock: true },
                orderBy: { createdAt: 'desc' },
            })

            // Fetch Exchange Rate
            const exchangeRate = await getUsdExchangeRate()

            // Fetch Real-time Prices and Calculate Summary
            const holdingsWithPrice = await Promise.all(holdings.map(async (holding) => {
                let currentPrice = 0
                try {
                    // Fetch Real-time Price
                    currentPrice = await fetchCurrentPrice(holding.stock.stockCode, holding.stock.market)
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
                    console.error(`Price fetch failed for ${holding.stock.stockName}`, e)
                    currentPrice = Number(holding.currentPrice) || 0
                }

                // Fallback to DB price if fetch failed
                if (currentPrice === 0 && Number(holding.currentPrice) > 0) {
                    currentPrice = Number(holding.currentPrice)
                }

                const totalCost = Number(holding.averagePrice) * holding.quantity
                const currentValue = currentPrice * holding.quantity
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
                    currentPrice,
                    currency,
                    purchaseRate: Number(holding.purchaseRate),
                    priceUpdatedAt: new Date(),
                    totalCost,
                    currentValue,
                    profit,
                    profitRate,
                }
            }))

            // Calculate Total Summary (KRW Base)
            let totalCostKRW = 0
            let totalValueKRW = 0

            holdingsWithPrice.forEach(h => {
                if (h.currency === 'USD') {
                    totalCostKRW += h.totalCost * exchangeRate
                    totalValueKRW += h.currentValue * exchangeRate
                } else {
                    totalCostKRW += h.totalCost
                    totalValueKRW += h.currentValue
                }
            })

            const totalProfitKRW = totalValueKRW - totalCostKRW
            const totalProfitRateKRW = totalCostKRW > 0 ? (totalProfitKRW / totalCostKRW) * 100 : 0

            return {
                success: true,
                data: {
                    holdings: holdingsWithPrice,
                    summary: {
                        totalCost: totalCostKRW,
                        totalValue: totalValueKRW,
                        totalProfit: totalProfitKRW,
                        totalProfitRate: totalProfitRateKRW,
                        holdingsCount: holdingsWithPrice.length,
                        exchangeRate,
                    },
                },
            }
        } catch (error) {
            console.error('Holdings service error:', error)
            return { success: false, error: { code: 'FETCH_FAILED', message: '잔고 조회에 실패했습니다.' } }
        }
    }
}
