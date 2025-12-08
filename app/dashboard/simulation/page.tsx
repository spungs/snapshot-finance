import { prisma } from '@/lib/prisma'
import SimulationClient from './simulation-client'
import SimulationError from './simulation-error'

export default async function SimulationPage({
    searchParams,
}: {
    searchParams: Promise<{ userId?: string }>
}) {
    const { userId } = await searchParams
    const targetUserId = userId || 'test-user-free'

    const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
            accounts: true,
        },
    })

    if (!user || user.accounts.length === 0) {
        return <SimulationError />
    }

    const accountId = user.accounts[0].id

    const snapshots = await prisma.portfolioSnapshot.findMany({
        where: { accountId },
        orderBy: { snapshotDate: 'desc' },
        include: {
            holdings: {
                include: {
                    stock: true,
                },
            },
        },
    })

    // Serialize dates/decimals for client component
    const serializedSnapshots = snapshots.map(snap => ({
        ...snap,
        totalValue: Number(snap.totalValue),
        totalCost: Number(snap.totalCost),
        totalProfit: Number(snap.totalProfit),
        profitRate: Number(snap.profitRate),
        cashBalance: Number(snap.cashBalance),
        exchangeRate: snap.exchangeRate ? Number(snap.exchangeRate) : 1435,
        snapshotDate: snap.snapshotDate.toISOString(),
        createdAt: snap.createdAt.toISOString(),
        holdings: snap.holdings.map((h) => ({
            id: h.id,
            snapshotId: h.snapshotId,
            stockId: h.stockId,
            stock: h.stock,
            createdAt: h.createdAt,
            currency: h.currency,
            quantity: Number(h.quantity),
            averagePrice: Number(h.averagePrice),
            currentPrice: Number(h.currentPrice),
            totalCost: Number(h.totalCost),
            currentValue: Number(h.currentValue),
            profit: Number(h.profit),
            profitRate: Number(h.profitRate),
            purchaseRate: h.purchaseRate ? Number(h.purchaseRate) : 1,
        }))
    }))

    return <SimulationClient initialSnapshots={serializedSnapshots} />
}
