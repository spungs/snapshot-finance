import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { snapshotService } from '@/lib/services/snapshot-service'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import SnapshotDetailClient from './snapshot-detail-client'
import { SnapshotDetailSkeleton } from './snapshot-detail-skeleton'

export default async function SnapshotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  return (
    <Suspense fallback={<SnapshotDetailSkeleton />}>
      <SnapshotDetailContent id={id} userId={session.user.id} />
    </Suspense>
  )
}

async function SnapshotDetailContent({
  id,
  userId,
}: {
  id: string
  userId: string
}) {
  const snapshot = await snapshotService.getDetail(id)

  if (!snapshot) {
    notFound()
  }

  // Verify ownership
  if (snapshot.userId !== userId) {
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
    exchangeRate: snapshot.exchangeRate ? snapshot.exchangeRate.toNumber() : FALLBACK_USD_RATE,
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
