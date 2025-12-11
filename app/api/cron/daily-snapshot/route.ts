import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

import Decimal from 'decimal.js'

export const dynamic = 'force-dynamic' // Vercel Cron needs this

export async function GET(request: NextRequest) {
    // 1. Authentication
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // 2. Find eligible accounts
        // - isAutoSnapshotEnabled = true
        // - User plan is PRO or MAX
        const accounts = await prisma.securitiesAccount.findMany({
            where: {
                isAutoSnapshotEnabled: true,
            },
            include: {
                user: true,
            },
        })

        console.log(`[Cron] Found ${accounts.length} accounts for auto-snapshot.`)

        const results = []

        // 3. Process each account
        for (const account of accounts) {
            try {
                // Get the latest snapshot to copy from
                const latestSnapshot = await prisma.portfolioSnapshot.findFirst({
                    where: { accountId: account.id },
                    orderBy: { snapshotDate: 'desc' },
                    include: { holdings: true },
                })

                if (!latestSnapshot) {
                    results.push({ accountId: account.id, status: 'skipped', reason: 'No previous snapshot' })
                    continue
                }

                // Check if snapshot already exists for today (to prevent duplicates if cron runs multiple times)
                const today = new Date()
                const startOfDay = new Date(today.setHours(0, 0, 0, 0))
                const endOfDay = new Date(today.setHours(23, 59, 59, 999))

                const existingToday = await prisma.portfolioSnapshot.findFirst({
                    where: {
                        accountId: account.id,
                        snapshotDate: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                    },
                })

                if (existingToday) {
                    results.push({ accountId: account.id, status: 'skipped', reason: 'Already exists for today' })
                    continue
                }

                // Create new snapshot (Copy logic)
                // Note: In Phase 2, we copy the latest snapshot. In Phase 3, we will fetch fresh data from API.
                const newSnapshot = await prisma.portfolioSnapshot.create({
                    data: {
                        accountId: account.id,
                        snapshotDate: new Date(), // Now
                        totalValue: latestSnapshot.totalValue,
                        totalCost: latestSnapshot.totalCost,
                        totalProfit: latestSnapshot.totalProfit,
                        profitRate: latestSnapshot.profitRate,
                        cashBalance: latestSnapshot.cashBalance,
                        note: 'Auto-generated via Cron',
                        holdings: {
                            create: latestSnapshot.holdings.map((h: any) => ({
                                stockId: h.stockId,
                                quantity: h.quantity,
                                averagePrice: h.averagePrice,
                                currentPrice: h.currentPrice, // Keeping old price for now
                                totalCost: h.totalCost,
                                currentValue: h.currentValue,
                                profit: h.profit,
                                profitRate: h.profitRate,
                            })),
                        },
                    },
                })

                results.push({ accountId: account.id, status: 'success', snapshotId: newSnapshot.id })
            } catch (error) {
                console.error(`[Cron] Error processing account ${account.id}:`, error)
                results.push({ accountId: account.id, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' })
            }
        }

        return NextResponse.json({ success: true, results })
    } catch (error) {
        console.error('[Cron] Job failed:', error)
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}
