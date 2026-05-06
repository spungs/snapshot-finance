import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import Decimal from 'decimal.js'

// Unified Cron Job: Daily Snapshot + User Maintenance
// Schedule: 22:30 UTC Mon-Fri (07:30 KST Tue-Sat / 화~토)

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
    let errorLogged = false

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

            const users = await prisma.user.findMany({
                where: {
                    isAutoSnapshotEnabled: true,
                },
                include: {
                    holdings: {
                        include: { stock: true },
                        orderBy: { createdAt: 'asc' }
                    },
                },
            })

            console.log(`[Cron] Found ${users.length} users for snapshot.`)
            const usdRate = await getUsdExchangeRate()
            console.log(`[Cron] Using USD Rate: ${usdRate}`)

            // 사용자를 청크 단위(10명씩)로 병렬 처리 - 타임아웃 방지 + 외부 API 부하 제어
            const USER_BATCH_SIZE = 10

            const processUser = async (user: typeof users[number]) => {
                try {
                    if (user.holdings.length === 0) {
                        return { userId: user.id, status: 'skipped', reason: 'No holdings' }
                    }

                    // Fetch prices and calculate values (Real-time) — 모든 합계는 Decimal로
                    const usdRateDec = new Decimal(usdRate || 0)
                    let totalValue = new Decimal(0)
                    let totalCost = new Decimal(0)

                    const snapshotHoldingsData = await Promise.all(
                        user.holdings.map(async (holding) => {
                            const currentPrice = await getStockPrice(holding.stock.stockCode, holding.stock.market || 'Unknown')
                            const quantity = holding.quantity
                            const avgPrice = new Decimal(holding.averagePrice.toString())
                            const cur = new Decimal(currentPrice || 0)

                            const val = cur.times(quantity)
                            const cost = avgPrice.times(quantity)

                            // 매입금액은 매입 시점 환율(purchaseRate)로 동결 — 환율 변동만으로 매입금액이 출렁이지 않게 함
                            // purchaseRate 누락/legacy(1)면 현재 환율로 폴백
                            const purchaseRate = new Decimal(holding.purchaseRate.toString())
                            const effectivePurchaseRate = purchaseRate.gt(0) && !purchaseRate.equals(1)
                                ? purchaseRate
                                : usdRateDec
                            const krwValue = holding.currency === 'USD' ? val.times(usdRateDec) : val
                            const krwCost = holding.currency === 'USD' ? cost.times(effectivePurchaseRate) : cost

                            totalValue = totalValue.plus(krwValue)
                            totalCost = totalCost.plus(krwCost)

                            const hProfit = val.minus(cost)
                            const hProfitRate = cost.isZero() ? new Decimal(0) : hProfit.div(cost).times(100)

                            return {
                                stockId: holding.stockId,
                                quantity: quantity,
                                averagePrice: avgPrice,
                                currentPrice: cur,
                                currency: holding.currency,
                                totalCost: cost,
                                currentValue: val,
                                profit: hProfit,
                                profitRate: hProfitRate,
                                purchaseRate: purchaseRate.gt(0) ? purchaseRate : usdRateDec,
                            }
                        })
                    )

                    const totalProfit = totalValue.minus(totalCost)
                    const profitRate = totalCost.isZero() ? new Decimal(0) : totalProfit.div(totalCost).times(100)

                    const newSnapshot = await prisma.portfolioSnapshot.create({
                        data: {
                            userId: user.id,
                            snapshotDate: new Date(),
                            totalValue,
                            totalCost,
                            totalProfit,
                            profitRate,
                            cashBalance: user.cashBalance || new Decimal(0), // Capture current cash balance
                            exchangeRate: usdRateDec,
                            note: `Auto Snapshot (${new Date().toLocaleDateString('ko-KR')})`,
                            holdings: {
                                create: snapshotHoldingsData,
                            },
                        },
                    })

                    return { userId: user.id, status: 'success' as const, snapshotId: newSnapshot.id }
                } catch (error) {
                    console.error(`[Cron] Error processing user ${user.id}:`, error)
                    return { userId: user.id, status: 'failed' as const, error: error instanceof Error ? error.message : 'Unknown error' }
                }
            }

            for (let i = 0; i < users.length; i += USER_BATCH_SIZE) {
                const batch = users.slice(i, i + USER_BATCH_SIZE)
                const batchResults = await Promise.all(batch.map(processUser))
                results.push(...batchResults)
                console.log(`[Cron] Batch ${Math.floor(i / USER_BATCH_SIZE) + 1}/${Math.ceil(users.length / USER_BATCH_SIZE)} done (${batchResults.length} users)`)
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
            errorLogged = true
        } catch (logError) {
            console.error('[Cron] Failed to save error log to DB:', logError)
        }

        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    } finally {
        // Log Success/Partial — error 경로에서 이미 FAILED를 적었으면 중복 로그 방지
        if (!errorLogged && results.length > 0) {
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
