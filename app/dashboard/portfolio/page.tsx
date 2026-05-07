import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { holdingService } from '@/lib/services/holding-service'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import { PortfolioClient } from './portfolio-client'
import { PortfolioSkeleton } from './portfolio-skeleton'
import { AiChat } from '@/components/dashboard/ai-chat'
import { FloatingContainer } from '@/components/ui/floating-container'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  // 셸(헤더/바텀탭)은 layout에서 즉시 렌더되고,
  // KIS API를 포함한 데이터 페칭과 AI 챗 FAB 모두 Suspense 안에서 스트리밍된다
  // — 데이터 도달 전엔 FAB 도 노출되지 않아 로딩 화면이 깔끔하게 유지된다.
  return (
    <Suspense fallback={<PortfolioSkeleton />}>
      <PortfolioContent
        userId={session.user.id}
        userName={session.user.name ?? null}
      />
    </Suspense>
  )
}

async function PortfolioContent({
  userId,
  userName,
}: {
  userId: string
  userName: string | null
}) {
  const { data } = await holdingService.getList(userId)

  const summary = {
    totalCost: Number(data?.summary?.totalCost ?? 0),
    totalValue: Number(data?.summary?.totalValue ?? 0),
    totalProfit: Number(data?.summary?.totalProfit ?? 0),
    totalProfitRate: Number(data?.summary?.totalProfitRate ?? 0),
    holdingsCount: data?.summary?.holdingsCount ?? 0,
    exchangeRate: Number(data?.summary?.exchangeRate ?? FALLBACK_USD_RATE),
    exchangeRateUpdatedAt: data?.summary?.exchangeRateUpdatedAt ?? null,
    cashBalance: Number(data?.summary?.cashBalance ?? 0),
  }

  const holdings = (data?.holdings ?? []).map((h: any) => ({
    id: h.id,
    stockId: h.stockId,
    stockCode: h.stockCode,
    stockName: h.stockName,
    market: h.market || 'Unknown',
    quantity: Number(h.quantity),
    averagePrice: Number(h.averagePrice),
    currentPrice: Number(h.currentPrice),
    currency: h.currency,
    purchaseRate: Number(h.purchaseRate ?? 0),
    totalCost: Number(h.totalCost),
    currentValue: Number(h.currentValue),
    profit: Number(h.profit),
    profitRate: Number(h.profitRate),
  }))

  return (
    <>
      <PortfolioClient
        initialHoldings={holdings}
        summary={summary}
        userName={userName}
      />
      <FloatingContainer>
        <AiChat isAuthenticated />
      </FloatingContainer>
    </>
  )
}
