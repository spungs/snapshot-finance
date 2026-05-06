import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { snapshotService } from '@/lib/services/snapshot-service'

// GET /api/snapshots/chart-data?period=1M|3M|6M|1Y|ALL
// service 가 사용자별 전체 데이터를 Redis 에 캐시(5분) 한다.
// period 필터링은 메모리에서 수행 — 모든 기간이 동일 캐시 항목을 공유하므로
// 사용자가 1M ↔ 3M ↔ 6M 토글해도 첫 조회 후엔 즉시 응답.
export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }
        const userId = session.user.id

        const { searchParams } = new URL(request.url)
        const period = searchParams.get('period') || '3M'

        // 기간별 시작일 계산
        const now = new Date()
        let fromDate: Date | undefined

        switch (period) {
            case '1M':
                fromDate = new Date(now)
                fromDate.setMonth(fromDate.getMonth() - 1)
                break
            case '3M':
                fromDate = new Date(now)
                fromDate.setMonth(fromDate.getMonth() - 3)
                break
            case '6M':
                fromDate = new Date(now)
                fromDate.setMonth(fromDate.getMonth() - 6)
                break
            case '1Y':
                fromDate = new Date(now)
                fromDate.setFullYear(fromDate.getFullYear() - 1)
                break
            case 'ALL':
            default:
                fromDate = undefined
        }

        const allData = await snapshotService.getChartData(userId)
        const chartData = fromDate
            ? allData.filter((d) => new Date(d.date) >= fromDate!)
            : allData

        return NextResponse.json({ success: true, data: chartData, period })
    } catch (error) {
        console.error('Chart data fetch error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'CHART_DATA_FETCH_FAILED', message: '차트 데이터 조회에 실패했습니다.' } },
            { status: 500 }
        )
    }
}
