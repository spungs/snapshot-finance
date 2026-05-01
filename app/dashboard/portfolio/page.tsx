import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { holdingService } from '@/lib/services/holding-service'
import { PortfolioClient } from './portfolio-client'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const { data } = await holdingService.getList(session.user.id)

  const summary = {
    totalCost: Number(data?.summary?.totalCost ?? 0),
    totalValue: Number(data?.summary?.totalValue ?? 0),
    totalProfit: Number(data?.summary?.totalProfit ?? 0),
    totalProfitRate: Number(data?.summary?.totalProfitRate ?? 0),
    holdingsCount: data?.summary?.holdingsCount ?? 0,
    exchangeRate: Number(data?.summary?.exchangeRate ?? 1435),
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

  return <PortfolioClient initialHoldings={holdings} summary={summary} />
}
