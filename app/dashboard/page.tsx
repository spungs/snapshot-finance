import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PortfolioSummaryCard } from '@/components/dashboard/portfolio-summary-card'
import { ProfitChart } from '@/components/dashboard/profit-chart'
import { HoldingsTable } from '@/components/dashboard/holdings-table'
import { SubscriptionStatusCard } from '@/components/dashboard/subscription-status-card'
import { UserSwitcher } from '@/components/dashboard/user-switcher'
import { formatDate } from '@/lib/utils/formatters'
import { prisma } from '@/lib/prisma'
import { SUBSCRIPTION_LIMITS } from '@/lib/config/subscription'
import { User, SecuritiesAccount, PortfolioSnapshot, StockHolding, Stock } from '@prisma/client'
import { toggleAutoSnapshot } from '@/app/actions'

// Server Component
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { userId?: string }
}) {
  const userId = searchParams.userId || 'test-user-free'

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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <div className="flex gap-2 items-center">
          <UserSwitcher />
          <Link href="/dashboard/snapshots/new">
            <Button>새 스냅샷 생성</Button>
          </Link>
        </div>
      </div>

      {/* Subscription Status */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SubscriptionStatusCard
          plan={plan}
          snapshotCount={snapshotCount}
          limit={limit}
          isAutoSnapshotEnabled={account?.isAutoSnapshotEnabled || false}
          // We can't pass a server action or handler easily here without 'use server' or client component wrapper.
          // For now, let's make SubscriptionStatusCard handle the API call internally?
          // Wait, SubscriptionStatusCard is a client component ('use client' at top).
          // So passing a function prop is fine if it's a Server Action, OR we can just let it handle the fetch internally?
          // The previous implementation passed `handleToggleAutoSnapshot`.
          // Since we are in a Server Component, we can't pass a client-side event handler directly unless it's a Server Action.
          // BUT, SubscriptionStatusCard is a Client Component.
          // We can pass the userId to it, and let IT handle the API call.
          // Let's modify SubscriptionStatusCard to take userId and handle the toggle internally.
          // For now, I will pass a dummy function or modify the component.
          // Actually, better to modify SubscriptionStatusCard to accept userId and do the fetch itself.
          onToggleAutoSnapshot={async (enabled) => {
            'use server'
            if (account) {
              await toggleAutoSnapshot(account.id, enabled)
            }
          }}
        />
      </div>

      {snapshots.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <p className="text-gray-500 mb-4">아직 저장된 스냅샷이 없습니다.</p>
          <Link href="/dashboard/snapshots/new">
            <Button>첫 스냅샷 생성하기</Button>
          </Link>
        </div>
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
          <div className="text-center">
            <Link href="/dashboard/snapshots">
              <Button variant="outline">전체 스냅샷 보기</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
