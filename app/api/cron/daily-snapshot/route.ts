import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'

// Unified Cron Job: Daily Snapshot + User Maintenance
// Schedule: 22:30 UTC Daily (07:30 KST Daily)

// Helper function to fetch price with retry
async function getStockPrice(symbol: string, market: string): Promise<number> {
    try {
        // Map market for KIS Client
        let marketType: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI'
        if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS') {
            marketType = 'US'
        } else if (market === 'KOSDAQ' || market === 'KQ') {
            marketType = 'KOSDAQ'
        }

        const priceData = await kisClient.getCurrentPrice(symbol, marketType)
        return priceData.price
    } catch (error) {
        console.warn(`[Cron] Failed to fetch price for ${symbol} (${market}), using 0. Error:`, error)
        return 0
    }
}

export async function GET(request: NextRequest) {
    // 1. Authentication
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const results: any[] = []

    try {
        // 2. Logic Branching based on Day of Week
        const now = new Date()
        const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
        // Run Snapshot on Mon-Fri UTC (Tue-Sat KST)
        // This covers the full trading week.
        const isSnapshotDay = dayOfWeek >= 1 && dayOfWeek <= 5

        // ---------------------------------------------------------
        // A. Snapshot Creation (Mon-Fri UTC)
        // ---------------------------------------------------------
        if (isSnapshotDay) {
            console.log(`[Cron] Start Daily Snapshot (Day: ${dayOfWeek})`)

            // Get users with holdings (Sorted by displayOrder)
            const users = await prisma.user.findMany({
                where: {
                    isAutoSnapshotEnabled: true,
                },
                include: {
                    holdings: {
                        include: { stock: true },
                        orderBy: { displayOrder: 'asc' }
                    },
                },
            })

            console.log(`[Cron] Found ${users.length} users for snapshot.`)
            const usdRate = await getUsdExchangeRate()
            console.log(`[Cron] Using USD Rate: ${usdRate}`)

            for (const user of users) {
                try {
                    if (user.holdings.length === 0) {
                        results.push({ userId: user.id, status: 'skipped', reason: 'No holdings' })
                        continue
                    }

                    // Fetch prices and calculate values (Real-time)
                    let totalValue = 0
                    let totalCost = 0

                    const snapshotHoldingsData = await Promise.all(
                        user.holdings.map(async (holding) => {
                            const currentPrice = await getStockPrice(holding.stock.stockCode, holding.stock.market)
                            const quantity = holding.quantity
                            const avgPrice = Number(holding.averagePrice)

                            const val = currentPrice * quantity
                            const cost = avgPrice * quantity

                            // Normalize values to KRW for portfolio total
                            const krwValue = holding.currency === 'USD' ? val * usdRate : val
                            const krwCost = holding.currency === 'USD' ? cost * usdRate : cost

                            totalValue += krwValue
                            totalCost += krwCost

                            // Per holding profit
                            const hProfit = val - cost
                            const hProfitRate = cost > 0 ? (hProfit / cost) * 100 : 0

                            return {
                                stockId: holding.stockId,
                                quantity: quantity,
                                averagePrice: avgPrice,
                                currentPrice: currentPrice,
                                currency: holding.currency,
                                totalCost: cost,
                                currentValue: val,
                                profit: hProfit,
                                profitRate: hProfitRate,
                                purchaseRate: Number(holding.purchaseRate || 1100), // Fallback if missing
                            }
                        })
                    )

                    const totalProfit = totalValue - totalCost
                    const profitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0

                    // Create Snapshot
                    const newSnapshot = await prisma.portfolioSnapshot.create({
                        data: {
                            userId: user.id,
                            snapshotDate: new Date(),
                            totalValue,
                            totalCost,
                            totalProfit,
                            profitRate,
                            cashBalance: user.cashBalance || 0, // Capture current cash balance
                            exchangeRate: usdRate,
                            note: `Auto Snapshot (${new Date().toLocaleDateString('ko-KR')})`,
                            holdings: {
                                create: snapshotHoldingsData,
                            },
                        },
                    })

                    results.push({ userId: user.id, status: 'success', snapshotId: newSnapshot.id })

                } catch (error) {
                    console.error(`[Cron] Error processing user ${user.id}:`, error)
                    results.push({ userId: user.id, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' })
                }
            }
        } else {
            console.log(`[Cron] Skipping Snapshot (Day: ${dayOfWeek}). Market closed.`)
            results.push({ status: 'skipped', reason: 'Weekend (Market Closed)' })
        }

        // ---------------------------------------------------------
        // B. User Cleanup (Always Runs)
        // ---------------------------------------------------------
        try {
            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

            const deletedUsers = await prisma.user.deleteMany({
                where: {
                    deletedAt: {
                        lt: thirtyDaysAgo,
                    },
                },
            })
            if (deletedUsers.count > 0) {
                console.log(`[Cron] Cleaned up ${deletedUsers.count} expired users.`)
                results.push({ action: 'cleanup', deletedCount: deletedUsers.count })
            }
        } catch (cleanupError) {
            console.error('[Cron] User cleanup failed:', cleanupError)
        }

        return NextResponse.json({ success: true, results })
    } catch (error) {
        console.error('[Cron] Job failed:', error)

        // Log Critical Failure
        try {
            const message = error instanceof Error ? error.message : String(error)

            await prisma.cronLog.create({
                data: {
                    jobName: 'DailySnapshot',
                    status: 'FAILED',
                    message: message,
                    details: { error: error as any, results }
                }
            })
        } catch (logError) {
            console.error('[Cron] Failed to save error log to DB:', logError)
        }

        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    } finally {
        // Log Success/Partial (if not already returned error)
        if (results.length > 0) {
            try {
                const failedCount = results.filter((r: any) => r.status === 'failed').length
                const status = failedCount > 0 ? (failedCount === results.length ? 'FAILED' : 'PARTIAL') : 'SUCCESS'

                await prisma.cronLog.create({
                    data: {
                        jobName: 'DailySnapshot',
                        status: status,
                        message: `Processed ${results.length} items. Failed: ${failedCount}`,
                        details: { results }
                    }
                })
            } catch (logError) {
                console.error('[Cron] Failed to save log to DB:', logError)
            }
        }
    }
}
