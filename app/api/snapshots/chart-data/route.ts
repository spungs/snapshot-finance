import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { snapshotService } from '@/lib/services/snapshot-service'

// GET /api/snapshots/chart-data
// 사용자의 전체 스냅샷 차트 데이터 반환. period 필터링은 클라이언트가 메모리에서 수행.
// service 가 Redis 에 캐시(1시간 TTL)하고 변이 시 즉시 invalidate 한다.
export async function GET(_request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const data = await snapshotService.getChartData(session.user.id)
        return NextResponse.json({ success: true, data })
    } catch (error) {
        console.error('Chart data fetch error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'CHART_DATA_FETCH_FAILED', message: '차트 데이터 조회에 실패했습니다.' } },
            { status: 500 }
        )
    }
}
