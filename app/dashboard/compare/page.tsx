import { redirect } from 'next/navigation'
import { getPortfolioContext, listManagedPortfolios } from '@/lib/portfolio-context'
import { snapshotService } from '@/lib/services/snapshot-service'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { CompareChart, type CompareSeries } from '@/components/dashboard/compare-chart'

export const dynamic = 'force-dynamic'

// 나 vs 위임으로 관리 중인 포트폴리오의 추이 비교.
// 앱에서 유일하게 한 요청에서 두 사람 데이터를 읽는 경로 — 대상은 클라이언트 입력(쿠키/쿼리)이 아니라
// grant(grantee=나) 로만 정한다. ctx.portfolioUserId(active_portfolio 쿠키)는 의도적으로 쓰지 않는다
// → 관리 중이어도 화면은 항상 "나 vs grant 대상".
export default async function ComparePage() {
    const ctx = await getPortfolioContext()
    if (!ctx) {
        redirect('/auth/signin')
    }

    const managed = await listManagedPortfolios(ctx.actorId)
    if (managed.length === 0) {
        redirect('/dashboard/more')
    }

    const targets = [
        { userId: ctx.actorId, name: null, isSelf: true },
        ...managed.map((m) => ({ userId: m.ownerId, name: m.name, isSelf: false })),
    ]
    const [exchangeRate, pointsList] = await Promise.all([
        getUsdExchangeRate(),
        Promise.all(targets.map((t) => snapshotService.getChartData(t.userId))),
    ])
    const series: CompareSeries[] = targets.map((t, i) => ({ ...t, points: pointsList[i] }))

    return <CompareChart series={series} exchangeRate={exchangeRate} />
}
