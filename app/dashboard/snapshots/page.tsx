import { snapshotService } from '@/lib/services/snapshot-service'
import { SnapshotsClient } from './snapshots-client'

export const dynamic = 'force-dynamic'

const TEST_ACCOUNT_ID = 'test-account-1'

export default async function SnapshotsPage() {
  const { data: snapshots } = await snapshotService.getList(TEST_ACCOUNT_ID)

  // Serialize dates and decimals for client component
  // Serialize dates and decimals for client component
  const serializedSnapshots = snapshots?.map(snapshot => ({
    ...snapshot,
    snapshotDate: snapshot.snapshotDate.toISOString(),
    totalValue: snapshot.totalValue.toString(),
    totalCost: snapshot.totalCost.toString(),
    totalProfit: snapshot.totalProfit.toString(),
    profitRate: snapshot.profitRate.toString(),
    cashBalance: snapshot.cashBalance.toString(),
    exchangeRate: snapshot.exchangeRate ? Number(snapshot.exchangeRate) : 1435,
    note: snapshot.note || null,
    holdings: snapshot.holdings.map((h) => ({
      id: h.id,
      stock: { stockName: h.stock.stockName },
    })),
  })) || []

  return (
    <SnapshotsClient initialSnapshots={serializedSnapshots} />
  )
}

