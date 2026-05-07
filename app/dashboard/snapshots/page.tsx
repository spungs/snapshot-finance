import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { snapshotService } from '@/lib/services/snapshot-service'
import { prisma } from '@/lib/prisma'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import { SnapshotsClient } from './snapshots-client'
import { SnapshotsSkeleton } from './snapshots-skeleton'

export const dynamic = 'force-dynamic'

export default async function SnapshotsPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  return (
    <Suspense fallback={<SnapshotsSkeleton />}>
      <SnapshotsContent userId={session.user.id} />
    </Suspense>
  )
}

async function SnapshotsContent({ userId }: { userId: string }) {
  const [{ data: snapshots }, currentHoldingsRaw] = await Promise.all([
    snapshotService.getList(userId),
    prisma.holding.findMany({
      where: { userId },
      include: { stock: true },
    }),
  ])

  const currentHoldings = currentHoldingsRaw.map(h => ({
    id: h.id,
    stockId: h.stockId,
    stockCode: h.stock.stockCode,
    stockName: h.stock.stockName,
    quantity: h.quantity,
  }))

  // Serialize dates and decimals for client component
  const serializedSnapshots = snapshots?.map((snapshot: any) => ({
    ...snapshot,
    snapshotDate: snapshot.snapshotDate.toISOString(),
    totalValue: snapshot.totalValue.toString(),
    totalCost: snapshot.totalCost.toString(),
    totalProfit: snapshot.totalProfit.toString(),
    profitRate: snapshot.profitRate.toString(),
    cashBalance: snapshot.cashBalance.toString(),
    exchangeRate: snapshot.exchangeRate ? Number(snapshot.exchangeRate) : FALLBACK_USD_RATE,
    note: snapshot.note || null,
    holdings: snapshot.holdings.map((h: any) => ({
      id: h.id,
      stockId: h.stockId,
      quantity: h.quantity,

      stock: {
        stockName: h.stock.stockName,
        stockCode: h.stock.stockCode
      },
    })),
  })) || []

  return (
    <SnapshotsClient
      initialSnapshots={serializedSnapshots}
      currentHoldings={currentHoldings}
    />
  )
}
