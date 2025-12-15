import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import yahooFinance from 'yahoo-finance2'

// Unified Cron Job: Daily Snapshot + User Maintenance
// Schedule: 22:30 UTC Daily (07:30 KST Daily)
// Logic:
// 1. Snapshot: Runs Mon-Fri UTC (Tue-Sat KST) - Market Days
//    - Fetches REAL-TIME prices from Yahoo Finance
//    - Creates snapshot based on current holdings
// 2. Cleanup: Runs Every Day
//    - Deletes soft-deleted users older than 30 days

// Helper function to fetch price with retry
async function getStockPrice(symbol: string): Promise<number> {
    try {
        const quote = await yahooFinance.quote(symbol) as { regularMarketPrice?: number }
        return quote.regularMarketPrice || 0
    } catch (error) {
        console.warn(`[Cron] Failed to fetch price for ${symbol}, using 0.`)
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

            // Get users with holdings
            const users = await prisma.user.findMany({
                where: {
                    isAutoSnapshotEnabled: true,
                },
                include: {
                    holdings: {
                        include: { stock: true },
                    },
                },
            })

            console.log(`[Cron] Found ${users.length} users for snapshot.`)

            for (const user of users) {
                try {
                    if (user.holdings.length === 0) {
                        results.push({ userId: user.id, status: 'skipped', reason: 'No holdings' })
                        continue
                    }

                    // Idempotency: Check if snapshot already exists for today
                    const today = new Date()
                    const startOfDay = new Date(today.setHours(0, 0, 0, 0))
                    const endOfDay = new Date(today.setHours(23, 59, 59, 999))

                    const existingToday = await prisma.portfolioSnapshot.findFirst({
                        where: {
                            userId: user.id,
                            snapshotDate: {
                                gte: startOfDay,
                                lte: endOfDay,
                            },
                        },
                    })
                    if (existingToday) {
                        results.push({ userId: user.id, status: 'skipped', reason: 'Already exists for today' })
                        continue
                    }

                    // Fetch prices and calculate values (Real-time)
                    let totalValue = 0
                    let totalCost = 0

                    const snapshotHoldingsData = await Promise.all(
                        user.holdings.map(async (holding) => {
                            const currentPrice = await getStockPrice(holding.stock.stockCode)
                            const quantity = holding.quantity
                            const avgPrice = Number(holding.averagePrice)

                            const val = currentPrice * quantity
                            const cost = avgPrice * quantity

                            totalValue += val
                            totalCost += cost

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
                            exchangeRate: 1400, // TODO: Fetch real exchange rate if needed, currently static or fixed
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
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}
