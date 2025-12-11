import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { snapshotService } from '@/lib/services/snapshot-service'
import { SnapshotsClient } from './snapshots-client'

export const dynamic = 'force-dynamic'

export default async function SnapshotsPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const { data: snapshots } = await snapshotService.getList(session.user.id)

  // Serialize dates and decimals for client component
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
      stock: { stockName: h.stock.stockName },
    })),
  })) || []

  return (
    <SnapshotsClient initialSnapshots={serializedSnapshots} />
  )
}

