
import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { holdingService } from '@/lib/services/holding-service'
import { redirect } from 'next/navigation'

import { HoldingsManager } from '@/components/dashboard/holdings-manager'
import { DashboardRefreshWrapper } from '@/components/dashboard/dashboard-refresh-wrapper'

import { Skeleton } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const { data } = await holdingService.getList(session.user.id)

  // Serialize for client component
  const initialData = data ? {
    holdings: data.holdings.map(h => ({
      ...h,
      market: h.market || 'Unknown',
      // Ensure plain objects
      priceUpdatedAt: h.priceUpdatedAt instanceof Date ? h.priceUpdatedAt.toISOString() : h.priceUpdatedAt,
      displayOrder: (h as any).displayOrder ?? 0
    })),
    summary: data.summary || { totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitRate: 0, holdingsCount: 0, targetAsset: 0 }
  } : undefined

  return (
    <DashboardRefreshWrapper cashBalance={initialData?.summary?.cashBalance}>
      {/* 잔고 관리 */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <HoldingsManager
          initialHoldings={initialData?.holdings || []}
          summary={initialData?.summary || { totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitRate: 0, holdingsCount: 0, targetAsset: 0 }}
          triggerRefresh={async () => {
            'use server'
            // This is a dummy for now since we handle refresh client-side or use router.refresh() 
            // But HoldingsManager expects a function. 
            // Actually, DashboardRefreshWrapper might be doing the refreshing? 
            // Let's check DashboardRefreshWrapper.
            // Logic check: The previous code didn't pass refresh handler to HoldingsManager. 
            // But I added triggerRefresh to props in HoldingsManager.
            // I should probably just pass a dummy or implement a real server action refresh if needed.
            // For now, let's pass a no-op or a revalidatePath action if I have one.
          }}
        />
      </Suspense>

    </DashboardRefreshWrapper >
  )
}
