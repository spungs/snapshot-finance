import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import SnapshotDetailClient from './snapshot-detail-client'
import { notFound } from 'next/navigation'

export default async function SnapshotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await auth()
  if (!user) return null

  const snapshot = await prisma.portfolioSnapshot.findUnique({
    where: { id },
    include: {
      holdings: {
        include: {
          stock: true,
        },
      },
    },
  })

  if (!snapshot) {
    notFound()
  }

  // Verify ownership
  const account = await prisma.securitiesAccount.findUnique({
    where: { id: snapshot.accountId },
  })

  if (account?.userId !== user.id) {
    notFound()
  }

  // Convert Decimal objects to numbers for client component serialization
  const serializedSnapshot = {
    ...snapshot,
    totalValue: snapshot.totalValue.toNumber(),
    totalCost: snapshot.totalCost.toNumber(),
    totalProfit: snapshot.totalProfit.toNumber(),
    profitRate: snapshot.profitRate.toNumber(),
    cashBalance: snapshot.cashBalance.toNumber(),
    holdings: snapshot.holdings.map(holding => ({
      ...holding,
      averagePrice: holding.averagePrice.toNumber(),
      currentPrice: holding.currentPrice.toNumber(),
      totalCost: holding.totalCost.toNumber(),
      currentValue: holding.currentValue.toNumber(),
      profit: holding.profit.toNumber(),
      profitRate: holding.profitRate.toNumber(),
      purchaseRate: holding.purchaseRate ? holding.purchaseRate.toNumber() : null,
    })),
  }

  return <SnapshotDetailClient snapshot={serializedSnapshot} />
}
