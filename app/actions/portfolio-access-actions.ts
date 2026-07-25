'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ACTIVE_PORTFOLIO_COOKIE } from '@/lib/portfolio-context'

// 지속 쿠키 1년 — 리로드·PWA 재실행에도 관리 모드 유지. 관리 모드 여부는 상시 배너로 명확히 표시.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * 활성 포트폴리오 전환. ownerId 를 넘기면 그 사람 포트폴리오 관리 모드로, 'self'(또는 내 id)면 해제.
 * 쿠키 설정 전 반드시 PortfolioAccess grant 를 서버에서 재검증한다(권한 없는 owner 로 전환 차단).
 */
export async function setActivePortfolio(ownerIdOrSelf: string): Promise<{ success: boolean }> {
    const session = await auth()
    const actorId = session?.user?.id
    if (!actorId) return { success: false }

    const cookieStore = await cookies()

    if (!ownerIdOrSelf || ownerIdOrSelf === 'self' || ownerIdOrSelf === actorId) {
        cookieStore.delete(ACTIVE_PORTFOLIO_COOKIE)
        revalidatePath('/dashboard', 'layout')
        return { success: true }
    }

    // 위임 grant 검증 — 없으면 전환 거부(쿠키 미설정)
    const grant = await prisma.portfolioAccess.findUnique({
        where: { ownerId_granteeId: { ownerId: ownerIdOrSelf, granteeId: actorId } },
        select: { id: true },
    })
    if (!grant) return { success: false }

    cookieStore.set(ACTIVE_PORTFOLIO_COOKIE, ownerIdOrSelf, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: ONE_YEAR_SECONDS,
    })
    revalidatePath('/dashboard', 'layout')
    return { success: true }
}
