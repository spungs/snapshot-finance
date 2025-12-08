import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import yahooFinance from 'yahoo-finance2'

// Weekly auto-snapshot cron job
// Runs every Friday after US market close + 30 minutes (4:30 PM ET = 21:30 UTC)
// Vercel Cron: 30 21 * * 5

export async function GET(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Get all accounts with holdings
        const accounts = await prisma.securitiesAccount.findMany({
            include: {
                holdings: {
                    include: { stock: true },
                },
            },
        })

        const results = []

        for (const account of accounts) {
            if (account.holdings.length === 0) continue

            // Fetch current prices for all holdings
            const holdingsWithPrice = await Promise.all(
                account.holdings.map(async (holding) => {
                    let currentPrice = 0
                    try {
                        const quote = await yahooFinance.quote(holding.stock.stockCode) as { regularMarketPrice?: number }
                        currentPrice = quote.regularMarketPrice || 0
                    } catch (e) {
                        console.error(`Failed to fetch price for ${holding.stock.stockCode}`)
                    }

                    const totalCost = Number(holding.averagePrice) * holding.quantity
                    const currentValue = currentPrice * holding.quantity
                    const profit = currentValue - totalCost
                    const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0

                    return {
                        stockId: holding.stockId,
                        quantity: holding.quantity,
                        averagePrice: Number(holding.averagePrice),
                        currentPrice,
                        totalCost,
                        currentValue,
                        profit,
                        profitRate,
                        currency: holding.currency,
                        purchaseRate: Number(holding.purchaseRate),
                    }
                })
            )

            // Calculate totals
            const totalCost = holdingsWithPrice.reduce((sum, h) => sum + h.totalCost, 0)
            const totalValue = holdingsWithPrice.reduce((sum, h) => sum + h.currentValue, 0)
            const totalProfit = totalValue - totalCost
            const profitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0

            // Create snapshot
            const snapshot = await prisma.portfolioSnapshot.create({
                data: {
                    accountId: account.id,
                    snapshotDate: new Date(),
                    totalValue,
                    totalCost,
                    totalProfit,
                    profitRate,
                    cashBalance: 0,
                    note: `주간 자동 스냅샷 - ${new Date().toLocaleDateString('ko-KR')}`,
                    holdings: {
                        create: holdingsWithPrice.map((h) => ({
                            stockId: h.stockId,
                            quantity: h.quantity,
                            averagePrice: h.averagePrice,
                            currentPrice: h.currentPrice,
                            totalCost: h.totalCost,
                            currentValue: h.currentValue,
                            profit: h.profit,
                            profitRate: h.profitRate,
                            currency: h.currency,
                            purchaseRate: h.purchaseRate,
                        })),
                    },
                },
            })

            results.push({
                accountId: account.id,
                snapshotId: snapshot.id,
                holdingsCount: holdingsWithPrice.length,
            })
        }

        return NextResponse.json({
            success: true,
            message: `Created ${results.length} weekly snapshots`,
            data: results,
        })
    } catch (error) {
        console.error('Weekly snapshot cron error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to create weekly snapshots' },
            { status: 500 }
        )
    }
}
