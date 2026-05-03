import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { snapshotService } from '@/lib/services/snapshot-service'
import { SnapshotsClient } from './snapshots-client'

export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'

export default async function SnapshotsPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const { data: snapshots } = await snapshotService.getList(session.user.id)

  // Fetch current holdings for comparison
  const currentHoldingsRaw = await prisma.holding.findMany({
    where: { userId: session.user.id },
    include: { stock: true }
  })

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
    exchangeRate: snapshot.exchangeRate ? Number(snapshot.exchangeRate) : 1435,
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

