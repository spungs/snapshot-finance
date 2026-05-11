import { prisma } from '@/lib/prisma'
import { assertAccountOwnership as checkAccountOwnership } from '@/lib/auth-helpers'
import { cacheGet, cacheSet, cacheDelete } from '@/lib/cache'

// L2 (Upstash Redis) 캐시 — 사용자별 계좌 목록 + 보유 종목 수.
// CUD / 종목 변이 시 invalidate(userId) 로 무효화. TTL 은 fail-safe (드물지만 invalidate 실패 시 자연 만료).
const ACCOUNTS_CACHE_TTL_SECONDS = 3600 // 1 hour
const accountsCacheKey = (userId: string) => `accounts:list:${userId}`

export interface AccountListItem {
    id: string
    name: string
    displayOrder: number
    holdingsCount: number
}

export const accountService = {
    async getList(userId: string): Promise<AccountListItem[]> {
        const key = accountsCacheKey(userId)
        const cached = await cacheGet<AccountListItem[]>(key)
        if (cached) return cached

        const rows = await prisma.brokerageAccount.findMany({
            where: { userId },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
                id: true,
                name: true,
                displayOrder: true,
                _count: { select: { holdings: true } },
            },
        })
        const mapped: AccountListItem[] = rows.map((a) => ({
            id: a.id,
            name: a.name,
            displayOrder: a.displayOrder,
            holdingsCount: a._count.holdings,
        }))
        await cacheSet(key, mapped, ACCOUNTS_CACHE_TTL_SECONDS)
        return mapped
    },

    async invalidate(userId: string): Promise<void> {
        await cacheDelete(accountsCacheKey(userId))
    },
}

/**
 * 사용자에게 BrokerageAccount 가 한 개도 없으면 "기본 계좌" 를 새로 만들어 반환한다.
 * 신규 가입자 / 마지막 계좌 삭제 후 종목 추가 시도 등에서 사용.
 *
 * - 다른 곳에서 동시에 호출돼도 안전하도록 단순 트랜잭션으로 감쌈
 *   (BrokerageAccount 에는 unique 제약이 없으므로 race condition 시 중복 한 번 정도는 허용 — 사용자가 수동으로 정리 가능)
 *
 * @param userId 대상 사용자 id
 * @param defaultName 기본 계좌 이름 (i18n 처리된 라벨, 클라이언트 언어 기준)
 * @returns 항상 최소 1개 존재함이 보장된 첫 BrokerageAccount
 */
export async function ensureUserHasAccount(
    userId: string,
    defaultName: string = '기본 계좌',
) {
    const existing = await prisma.brokerageAccount.findFirst({
        where: { userId },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    })
    if (existing) return existing

    return prisma.brokerageAccount.create({
        data: {
            userId,
            name: defaultName,
            displayOrder: 0,
        },
    })
}

/**
 * accountId 가 정말 해당 userId 소유인지 검증.
 * IDOR 방어용 — 모든 계좌 관련 server action / API 핸들러에서 사용.
 *
 * 인자가 잘못되면 throw — caller 가 적절히 try/catch.
 */
export async function assertAccountOwnership(accountId: string, userId: string) {
    if (!accountId || !userId) {
        throw new Error('Forbidden')
    }
    const account = await checkAccountOwnership(accountId, userId)
    if (!account) {
        throw new Error('Forbidden')
    }
    return account
}
