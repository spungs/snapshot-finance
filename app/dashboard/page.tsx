import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { holdingService } from '@/lib/services/holding-service'
import { snapshotService } from '@/lib/services/snapshot-service'
import { HomeClient } from './home-client'
import { HomeSkeleton } from './home-skeleton'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  // 셸(헤더/바텀탭)은 layout에서 즉시 렌더되고,
  // KIS API를 포함한 데이터 페칭은 Suspense 경계 안에서 스트리밍된다.
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent userId={session.user.id} />
    </Suspense>
  )
}

async function HomeContent({ userId }: { userId: string }) {
  const [{ data: holdingsData }, { data: snapshotsData }] = await Promise.all([
    holdingService.getList(userId),
    snapshotService.getList(userId, 30),
  ])

  const summary = holdingsData?.summary ?? {
    totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitRate: 0,
    holdingsCount: 0, exchangeRate: 1435, cashBalance: 0,
  }

  const holdings = (holdingsData?.holdings ?? []).map(h => ({
    id: h.id,
    stockCode: h.stockCode,
    stockName: h.stockName,
    market: h.market || 'Unknown',
    currency: h.currency,
    currentValue: Number(h.currentValue),
    profit: Number(h.profit),
    profitRate: Number(h.profitRate),
  }))

  const recentSnapshots = (snapshotsData ?? []).map((s: any) => ({
    id: s.id,
    snapshotDate: s.snapshotDate.toISOString(),
    totalValue: Number(s.totalValue),
    profitRate: Number(s.profitRate),
    exchangeRate: s.exchangeRate ? Number(s.exchangeRate) : 1435,
  }))

  const todayLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')

  return (
    <HomeClient
      summary={{
        totalValue: Number(summary.totalValue),
        totalCost: Number(summary.totalCost),
        totalProfit: Number(summary.totalProfit),
        totalProfitRate: Number(summary.totalProfitRate),
        cashBalance: Number(summary.cashBalance ?? 0),
        exchangeRate: Number(summary.exchangeRate ?? 1435),
        holdingsCount: summary.holdingsCount,
      }}
      holdings={holdings}
      recentSnapshots={recentSnapshots}
      todayLabel={todayLabel + ' · ' + (new Date().getHours() < 12 ? '오전' : '오후')}
    />
  )
}
