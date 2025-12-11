import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import SnapshotDetailClient from './snapshot-detail-client'
import { notFound } from 'next/navigation'
import { snapshotService } from '@/lib/services/snapshot-service'

export default async function SnapshotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return null

  const snapshot = await snapshotService.getDetail(id)

  if (!snapshot) {
    notFound()
  }

  // Verify ownership
  if (snapshot.userId !== session.user.id) {
    notFound()
  }

  // Convert Decimal objects to numbers for client component serialization
  const serializedSnapshot = {
    ...snapshot,
    snapshotDate: snapshot.snapshotDate.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
    totalValue: snapshot.totalValue.toNumber(),
    totalCost: snapshot.totalCost.toNumber(),
    totalProfit: snapshot.totalProfit.toNumber(),
    profitRate: snapshot.profitRate.toNumber(),
    cashBalance: snapshot.cashBalance.toNumber(),
    exchangeRate: snapshot.exchangeRate ? snapshot.exchangeRate.toNumber() : 1435,
    holdings: snapshot.holdings.map((holding) => ({
      id: holding.id,
      snapshotId: holding.snapshotId,
      stockId: holding.stockId,
      quantity: holding.quantity,
      createdAt: holding.createdAt.toISOString(),
      currency: holding.currency,
      stock: {
        stockCode: holding.stock.stockCode,
        stockName: holding.stock.stockName,
      },
      // Decimals converted to numbers
      averagePrice: holding.averagePrice.toNumber(),
      currentPrice: holding.currentPrice.toNumber(),
      totalCost: holding.totalCost.toNumber(),
      currentValue: holding.currentValue.toNumber(),
      profit: holding.profit.toNumber(),
      profitRate: holding.profitRate.toNumber(),
      purchaseRate: holding.purchaseRate ? holding.purchaseRate.toNumber() : 1,
    })),
  }

  return <SnapshotDetailClient snapshot={serializedSnapshot} />
}
