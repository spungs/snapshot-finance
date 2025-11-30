import { prisma } from '@/lib/prisma'
import SimulationClient from './simulation-client'
import SimulationError from './simulation-error'

export default async function SimulationPage({
    searchParams,
}: {
    searchParams: { userId?: string }
}) {
    const userId = searchParams.userId || 'test-user-free'

    const user = await prisma.user.findUnique({
        where: { id: userId },
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
        snapshotDate: snap.snapshotDate.toISOString(),
        createdAt: snap.createdAt.toISOString(),
        holdings: snap.holdings.map(h => ({
            ...h,
            quantity: Number(h.quantity),
            averagePrice: Number(h.averagePrice),
            currentPrice: Number(h.currentPrice),
            totalCost: Number(h.totalCost),
            currentValue: Number(h.currentValue),
            profit: Number(h.profit),
            profitRate: Number(h.profitRate),
        }))
    }))

    return <SimulationClient initialSnapshots={serializedSnapshots} />
}
