import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 위임 포트폴리오 관리의 단일 진입점.
// 앱 전체가 session.user.id 하나로 데이터를 스코핑하던 것을,
// "지금 로그인한 사람(actorId)" 과 "데이터를 읽고 쓸 대상(portfolioUserId)" 두 개념으로 분리한다.
//
// - 데이터 경로(holdings/snapshots/accounts/cash 등)는 portfolioUserId 를 쓴다.
// - 신원/quota/rate-limit 은 항상 actorId 를 쓴다.
//
// 보안: active_portfolio 쿠키는 "누구를 보고싶다"는 요청일 뿐이고,
// 권한은 매 요청 서버에서 PortfolioAccess grant 로 재검증한다. 쿠키 단독은 신뢰하지 않는다.

/** 관리 대상 포트폴리오를 지정하는 쿠키 이름. 값 = 보고자 하는 owner 의 userId. */
export const ACTIVE_PORTFOLIO_COOKIE = 'active_portfolio'

export type PortfolioContext = {
    actorId: string          // 지금 로그인한 사람(나) — 신원/quota/rate-limit 용
    portfolioUserId: string  // 데이터를 읽고 쓸 대상(나 또는 위임받은 owner)
    isManaging: boolean      // 남의 포트폴리오를 관리 중인가
    actorName?: string       // 로그인한 사람의 표시명 (session 에서 그대로)
    actorRole?: string       // 로그인한 사람의 role (admin 우대 등 — 항상 actor 기준)
    ownerName?: string       // 관리 배너/표시용 (owner 의 name → email 폴백)
}

/**
 * 현재 요청의 포트폴리오 컨텍스트를 해석한다.
 * 로그인하지 않았으면 null(호출부가 기존과 동일하게 401/redirect 처리).
 *
 * 기존 코드에서 `const session = await auth(); ... session.user.id` 를 쓰던 자리를
 * `const ctx = await getPortfolioContext(); ... ctx.portfolioUserId` 로 바꾼다.
 */
export async function getPortfolioContext(): Promise<PortfolioContext | null> {
    const session = await auth()
    const actorId = session?.user?.id
    if (!actorId) return null
    const actorName = session?.user?.name ?? undefined
    const actorRole = (session?.user as { role?: string } | undefined)?.role ?? undefined

    const cookieStore = await cookies()
    const requested = cookieStore.get(ACTIVE_PORTFOLIO_COOKIE)?.value

    // 쿠키 없음 / 자기 자신 → 내 포트폴리오
    if (!requested || requested === actorId) {
        return { actorId, portfolioUserId: actorId, isManaging: false, actorName, actorRole }
    }

    // 위임 grant 서버 검증 — 없으면 조용히 self 로 폴백(쿠키 위조 무력화)
    const grant = await prisma.portfolioAccess.findUnique({
        where: { ownerId_granteeId: { ownerId: requested, granteeId: actorId } },
        select: { owner: { select: { name: true, email: true } } },
    })

    if (!grant) {
        return { actorId, portfolioUserId: actorId, isManaging: false, actorName, actorRole }
    }

    return {
        actorId,
        portfolioUserId: requested,
        isManaging: true,
        actorName,
        actorRole,
        ownerName: grant.owner.name ?? grant.owner.email ?? undefined,
    }
}

/**
 * 현재 actor 가 관리할 수 있는(위임받은) owner 목록.
 * 프로필 스위처 노출 여부/항목 렌더링에 쓴다. grant 가 0개면 스위처를 아예 숨긴다.
 */
export async function listManagedPortfolios(
    actorId: string,
): Promise<Array<{ ownerId: string; name: string }>> {
    const grants = await prisma.portfolioAccess.findMany({
        where: { granteeId: actorId },
        select: { ownerId: true, owner: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
    })
    return grants.map((g) => ({
        ownerId: g.ownerId,
        name: g.owner.name ?? g.owner.email ?? '이름 없음',
    }))
}
