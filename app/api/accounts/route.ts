import { NextResponse } from 'next/server'
import { getPortfolioContext } from '@/lib/portfolio-context'
import { accountService } from '@/lib/services/account-service'

// GET /api/accounts — 사용자 계좌 목록 (L2 Redis 캐시 사용)
export async function GET() {
    const ctx = await getPortfolioContext()
    if (!ctx) {
        return NextResponse.json(
            { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
            { status: 401 }
        )
    }
    try {
        const accounts = await accountService.getList(ctx.portfolioUserId)
        return NextResponse.json({ success: true, data: accounts })
    } catch (error) {
        console.error('[accounts GET] error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'FETCH_FAILED', message: '계좌 조회 실패' } },
            { status: 500 }
        )
    }
}
