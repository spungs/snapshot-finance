import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PortfolioSummaryCard } from '@/components/dashboard/portfolio-summary-card'
import { ProfitChart } from '@/components/dashboard/profit-chart'
import { HoldingsTable } from '@/components/dashboard/holdings-table'
import { SubscriptionStatusCard } from '@/components/dashboard/subscription-status-card'
import { UserSwitcher } from '@/components/dashboard/user-switcher'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { EmptySnapshotState } from '@/components/dashboard/empty-snapshot-state'
import { ViewAllSnapshotsLink } from '@/components/dashboard/view-all-snapshots-link'
import { formatDate } from '@/lib/utils/formatters'
import { prisma } from '@/lib/prisma'
import { SUBSCRIPTION_LIMITS } from '@/lib/config/subscription'
import { User, SecuritiesAccount, PortfolioSnapshot, StockHolding, Stock } from '@prisma/client'
import { toggleAutoSnapshot } from '@/app/actions'

// Server Component
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>
}) {
  const params = await searchParams
  const userId = params.userId || 'test-user-free'

  // 1. Fetch User & Account Data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: true,
    },
  })

  // Handle case where user doesn't exist (e.g. invalid ID in URL)
  if (!user) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">User Not Found</h1>
        <p className="mb-4">The requested user ID does not exist.</p>
        <UserSwitcher />
      </div>
    )
  }

  const account = user.accounts[0]
  const plan = user.plan
  // Fix: Cast plan to keyof typeof SUBSCRIPTION_LIMITS
  const limit = SUBSCRIPTION_LIMITS[plan as keyof typeof SUBSCRIPTION_LIMITS]

  // 2. Fetch Snapshots (if account exists)
  let snapshots: (PortfolioSnapshot & { holdings: (StockHolding & { stock: Stock })[] })[] = []
  let snapshotCount = 0

  if (account) {
    // Parallel fetch for performance
    const [fetchedSnapshots, count] = await Promise.all([
      prisma.portfolioSnapshot.findMany({
        where: { accountId: account.id },
        orderBy: { snapshotDate: 'desc' },
        include: {
          holdings: {
            include: {
              stock: true,
            },
          },
        },
      }),
      prisma.portfolioSnapshot.count({
        where: { accountId: account.id },
      }),
    ])
    snapshots = fetchedSnapshots
    snapshotCount = count
  }

  const latestSnapshot = snapshots[0]

  // Chart Data
  const chartData = [...snapshots]
    .reverse()
    .map((s) => ({
      date: s.snapshotDate.toISOString(), // Serialize date for client component
      profitRate: Number(s.profitRate),
      totalValue: Number(s.totalValue),
    }))

  // Helper to serialize Decimal/Date for client components
  // (Prisma returns Decimal/Date objects which can't be passed directly to Client Components in some cases,
  // but here we are passing primitives mostly. Be careful with Date/Decimal.)
  // Actually, for the components we have, we need to convert Decimal to number.

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader />

      {/* Subscription Status */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SubscriptionStatusCard
          plan={plan}
          snapshotCount={snapshotCount}
          limit={limit}
          isAutoSnapshotEnabled={account?.isAutoSnapshotEnabled || false}
          onToggleAutoSnapshot={async (enabled) => {
            'use server'
            if (account) {
              await toggleAutoSnapshot(account.id, enabled)
            }
          }}
        />
      </div>

      {snapshots.length === 0 ? (
        <EmptySnapshotState />
      ) : (
        <>
          {/* Portfolio Summary */}
          {latestSnapshot && (
            <PortfolioSummaryCard
              totalValue={Number(latestSnapshot.totalValue)}
              totalCost={Number(latestSnapshot.totalCost)}
              totalProfit={Number(latestSnapshot.totalProfit)}
              profitRate={Number(latestSnapshot.profitRate)}
              cashBalance={Number(latestSnapshot.cashBalance)}
              holdingsCount={latestSnapshot.holdings.length}
              snapshotDate={formatDate(latestSnapshot.snapshotDate)}
            />
          )}

          {/* Profit Chart */}
          <ProfitChart data={chartData} />

          {/* Holdings Table */}
          {latestSnapshot && (
            <HoldingsTable
              holdings={latestSnapshot.holdings.map((h) => ({
                id: h.id,
                stock: {
                  stockCode: h.stock.stockCode,
                  stockName: h.stock.stockName,
                },
                quantity: Number(h.quantity),
                averagePrice: Number(h.averagePrice),
                currentPrice: Number(h.currentPrice),
                totalCost: Number(h.totalCost),
                currentValue: Number(h.currentValue),
                profit: Number(h.profit),
                profitRate: Number(h.profitRate),
              }))}
            />
          )}

          {/* View All Link */}
          <ViewAllSnapshotsLink />
        </>
      )}
    </div>
  )
}
