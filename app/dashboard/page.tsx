
import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { holdingService } from '@/lib/services/holding-service'
import { redirect } from 'next/navigation'

import { HoldingsManager } from '@/components/dashboard/holdings-manager'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { ViewAllSnapshotsLink } from '@/components/dashboard/view-all-snapshots-link'
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
      // Ensure plain objects
      priceUpdatedAt: h.priceUpdatedAt instanceof Date ? h.priceUpdatedAt.toISOString() : h.priceUpdatedAt
    })),
    summary: data.summary || { totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitRate: 0, holdingsCount: 0 }
  } : undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <Suspense fallback={<Skeleton className="h-12 w-full" />}>
        <DashboardHeader />
      </Suspense>

      {/* 잔고 관리 */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <HoldingsManager initialData={initialData as any} />
      </Suspense>

      {/* 스냅샷 보기 링크 */}
      <Suspense fallback={<Skeleton className="h-8 w-full" />}>
        <ViewAllSnapshotsLink />
      </Suspense>
    </div>
  )
}
