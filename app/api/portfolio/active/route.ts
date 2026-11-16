import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ACTIVE_PORTFOLIO_COOKIE } from '@/lib/portfolio-context'

export const dynamic = 'force-dynamic'

// 지속 쿠키 1년 — 리로드·PWA 재실행에도 관리 모드 유지. 관리 모드 여부는 상시 배너로 명확히 표시.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * 활성 포트폴리오 전환. body.target 에 ownerId 를 넘기면 그 사람 포트폴리오 관리 모드로,
 * 'self'(또는 내 id)면 해제. 쿠키 설정 전 반드시 PortfolioAccess grant 를 서버에서 재검증한다.
 *
 * Server Action 이 아니라 Route Handler 인 이유: Server Action 에서 쿠키를 바꾸면
 * Next 가 응답에 현재 페이지를 통째로 다시 렌더해 싣는다. 전환은 어차피 직후에
 * 하드 네비게이션(use-portfolio-switch)을 하므로 그 렌더는 버려지고 대기 시간만 두 배가 됐다.
 */
export async function POST(request: NextRequest) {
    const session = await auth()
    const actorId = session?.user?.id
    if (!actorId) return NextResponse.json({ success: false }, { status: 401 })

    let target: unknown
    try {
        target = (await request.json())?.target
    } catch {
        return NextResponse.json({ success: false }, { status: 400 })
    }
    if (typeof target !== 'string') {
        return NextResponse.json({ success: false }, { status: 400 })
    }

    const cookieStore = await cookies()

    if (!target || target === 'self' || target === actorId) {
        cookieStore.delete(ACTIVE_PORTFOLIO_COOKIE)
        return NextResponse.json({ success: true })
    }

    // 위임 grant 검증 — 없으면 전환 거부(쿠키 미설정)
    const grant = await prisma.portfolioAccess.findUnique({
        where: { ownerId_granteeId: { ownerId: target, granteeId: actorId } },
        select: { id: true },
    })
    if (!grant) return NextResponse.json({ success: false }, { status: 403 })

    cookieStore.set(ACTIVE_PORTFOLIO_COOKIE, target, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: ONE_YEAR_SECONDS,
    })
    return NextResponse.json({ success: true })
}
