import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { holdingService } from '@/lib/services/holding-service'
import { snapshotService } from '@/lib/services/snapshot-service'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
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
  // bootstrap: 홈에서 보여줄 모든 데이터를 한 번에 병렬 fetch.
  // chartData 는 PerformanceChart 의 SWR fallback 으로 전달돼 첫 페인트에 차트가 보인다.
  const [{ data: holdingsData }, { data: snapshotsData }, chartData] = await Promise.all([
    holdingService.getList(userId),
    snapshotService.getList(userId, 30),
    snapshotService.getChartData(userId),
  ])

  const summary = holdingsData?.summary ?? {
    totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitRate: 0,
    holdingsCount: 0, exchangeRate: FALLBACK_USD_RATE, exchangeRateUpdatedAt: null, cashBalance: 0,
  }

  const holdings = (holdingsData?.holdings ?? []).map(h => ({
    id: h.id,
    stockCode: h.stockCode,
    stockName: h.stockName,
    market: h.market || 'Unknown',
    currency: h.currency,
    // 평가/원가/손익 원자 필드
    quantity: Number(h.quantity),
    currentPrice: Number(h.currentPrice),
    totalCost: Number(h.totalCost),
    purchaseRate: Number(h.purchaseRate ?? 0),
    currentValue: Number(h.currentValue),
    profit: Number(h.profit),
    profitRate: Number(h.profitRate),
    // 가격 신선도 footnote 용 — Date 객체 또는 ISO 문자열 모두 받아 normalize
    priceUpdatedAt: h.priceUpdatedAt
      ? (typeof h.priceUpdatedAt === 'string' ? h.priceUpdatedAt : new Date(h.priceUpdatedAt).toISOString())
      : null,
  }))

  const recentSnapshots = (snapshotsData ?? []).map((s: any) => ({
    id: s.id,
    snapshotDate: s.snapshotDate.toISOString(),
    totalValue: Number(s.totalValue),
    profitRate: Number(s.profitRate),
    exchangeRate: s.exchangeRate ? Number(s.exchangeRate) : FALLBACK_USD_RATE,
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
        exchangeRate: Number(summary.exchangeRate ?? FALLBACK_USD_RATE),
        exchangeRateUpdatedAt: summary.exchangeRateUpdatedAt ?? null,
        holdingsCount: summary.holdingsCount,
      }}
      holdings={holdings}
      recentSnapshots={recentSnapshots}
      initialChartData={chartData}
      todayLabel={todayLabel + ' · ' + (new Date().getHours() < 12 ? '오전' : '오후')}
    />
  )
}
