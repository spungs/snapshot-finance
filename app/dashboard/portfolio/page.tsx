import { Suspense } from 'react'
import { getPortfolioContext } from '@/lib/portfolio-context'
import { redirect } from 'next/navigation'
import { holdingService } from '@/lib/services/holding-service'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import { prisma } from '@/lib/prisma'
import type { CashAccount } from '@/types/cash'
import { PortfolioClient } from './portfolio-client'
import { PortfolioSkeleton } from './portfolio-skeleton'
import { AiChat } from '@/components/dashboard/ai-chat'
import { FloatingContainer } from '@/components/ui/floating-container'
import { isProUser } from '@/lib/billing/subscription'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  const ctx = await getPortfolioContext()
  if (!ctx) {
    redirect('/auth/signin')
  }

  // 셸(헤더/바텀탭)은 layout에서 즉시 렌더되고,
  // KIS API를 포함한 데이터 페칭과 AI 챗 FAB 모두 Suspense 안에서 스트리밍된다
  // — 데이터 도달 전엔 FAB 도 노출되지 않아 로딩 화면이 깔끔하게 유지된다.
  return (
    <Suspense fallback={<PortfolioSkeleton />}>
      <PortfolioContent
        userId={ctx.portfolioUserId}
        actorId={ctx.actorId}
        userName={(ctx.isManaging ? ctx.ownerName : ctx.actorName) ?? null}
      />
    </Suspense>
  )
}

async function PortfolioContent({
  userId,
  actorId,
  userName,
}: {
  userId: string
  actorId: string
  userName: string | null
}) {
  // 보유 종목과 계좌 목록을 병렬 조회. 계좌 목록은 셀렉터 / 보기 토글의 기반 데이터.
  // 데이터(holdings/계좌)는 관리 대상(userId), PRO 게이트는 AI 라우트와 동일하게 로그인한 나(actorId).
  const [{ data }, accountsRaw, pro] = await Promise.all([
    holdingService.getList(userId),
    prisma.brokerageAccount
      .findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      })
      .catch(() => [] as Array<{ id: string; name: string }>),
    isProUser(actorId),
  ])

  const summary = {
    totalCost: Number(data?.summary?.totalCost ?? 0),
    totalValue: Number(data?.summary?.totalValue ?? 0),
    totalProfit: Number(data?.summary?.totalProfit ?? 0),
    totalProfitRate: Number(data?.summary?.totalProfitRate ?? 0),
    holdingsCount: data?.summary?.holdingsCount ?? 0,
    exchangeRate: Number(data?.summary?.exchangeRate ?? FALLBACK_USD_RATE),
    exchangeRateUpdatedAt: data?.summary?.exchangeRateUpdatedAt ?? null,
    cashBalance: Number(data?.summary?.cashBalance ?? 0),
    cashAccounts: (data?.summary?.cashAccounts as CashAccount[] | null) ?? null,
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
    // Agent 4 가 /api/holdings 응답에 추가한 필드 — holding-service 가 함께 제공.
    accountId: h.accountId ?? null,
    accountName: h.accountName ?? null,
    // 주가 캐시 시점 — 헤더에 "주가 N분 전" 표시용. ISO string 으로 전달.
    priceUpdatedAt: h.priceUpdatedAt
      ? (typeof h.priceUpdatedAt === 'string' ? h.priceUpdatedAt : new Date(h.priceUpdatedAt).toISOString())
      : null,
  }))

  const accounts = accountsRaw.map(a => ({ id: a.id, name: a.name }))

  return (
    <>
      <PortfolioClient
        initialHoldings={holdings}
        summary={summary}
        userName={userName}
        accounts={accounts}
        isPro={pro}
      />
      <FloatingContainer>
        <AiChat isAuthenticated isPro={pro} />
      </FloatingContainer>
    </>
  )
}
