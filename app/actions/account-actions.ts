'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ensureUserHasAccount, assertAccountOwnership } from '@/lib/services/account-service'
import { holdingService } from '@/lib/services/holding-service'

const MAX_NAME_LENGTH = 30

type ActionResult<T = undefined> =
    | { success: true; data?: T }
    | { success: false; error: string }

/**
 * DB mutation 성공 후의 cache invalidation / revalidatePath 가 throw 해도
 * 사용자가 "실패" 로 잘못 인식하지 않도록 격리.
 *
 * 배경: 과거 revalidatePath / Next.js internal race 로 throw 가 발생하면 외부
 * catch 가 잡아 success: false 반환 → toast.error → 사용자 재시도 → 중복 변경
 * 데이터 무결성 문제 발생. DB 는 이미 commit 됐으므로 cleanup 실패는 non-critical.
 */
async function safeCleanup(userId: string, invalidateHoldings = false): Promise<void> {
    if (invalidateHoldings) {
        try {
            await holdingService.invalidate(userId)
        } catch (e) {
            console.warn('[account-actions] holdings cache invalidate failed (non-critical):', e)
        }
    }
    try {
        revalidatePath('/dashboard/accounts')
        revalidatePath('/dashboard/portfolio')
        revalidatePath('/dashboard')
    } catch (e) {
        console.warn('[account-actions] revalidatePath failed (non-critical):', e)
    }
}

function validateName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
    if (typeof raw !== 'string') return { ok: false, error: 'INVALID_NAME' }
    const trimmed = raw.trim()
    if (trimmed.length === 0) return { ok: false, error: 'NAME_REQUIRED' }
    if (trimmed.length > MAX_NAME_LENGTH) return { ok: false, error: 'NAME_TOO_LONG' }
    return { ok: true, value: trimmed }
}

/**
 * 신규 계좌 생성. displayOrder 는 현재 최대값 + 1 (목록 맨 뒤에 추가).
 */
export async function createAccount(name: string): Promise<ActionResult<{ id: string }>> {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'UNAUTHORIZED' }
    const userId = session.user.id

    const validated = validateName(name)
    if (!validated.ok) return { success: false, error: validated.error }

    try {
        const lastAccount = await prisma.brokerageAccount.findFirst({
            where: { userId },
            orderBy: { displayOrder: 'desc' },
            select: { displayOrder: true },
        })
        const nextOrder = lastAccount ? lastAccount.displayOrder + 1 : 0

        const created = await prisma.brokerageAccount.create({
            data: {
                userId,
                name: validated.value,
                displayOrder: nextOrder,
            },
            select: { id: true },
        })

        await safeCleanup(userId)
        return { success: true, data: { id: created.id } }
    } catch (error) {
        console.error('createAccount failed:', error)
        return { success: false, error: 'CREATE_FAILED' }
    }
}

/**
 * 계좌 이름 변경. IDOR 방어 적용.
 */
export async function renameAccount(accountId: string, name: string): Promise<ActionResult> {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'UNAUTHORIZED' }
    const userId = session.user.id

    const validated = validateName(name)
    if (!validated.ok) return { success: false, error: validated.error }

    try {
        await assertAccountOwnership(accountId, userId)

        await prisma.brokerageAccount.update({
            where: { id: accountId },
            data: { name: validated.value },
        })

        await safeCleanup(userId)
        return { success: true }
    } catch (error) {
        console.error('renameAccount failed:', error)
        return { success: false, error: 'RENAME_FAILED' }
    }
}

/**
 * 계좌 순서 일괄 갱신. orderedIds 의 인덱스를 그대로 displayOrder 로 사용.
 * 모든 id 가 본인 소유인지 한 번에 검증한 뒤, 단일 트랜잭션으로 업데이트.
 */
export async function reorderAccounts(orderedIds: string[]): Promise<ActionResult> {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'UNAUTHORIZED' }
    const userId = session.user.id

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return { success: false, error: 'INVALID_INPUT' }
    }
    // 입력 ID 중복 차단
    if (new Set(orderedIds).size !== orderedIds.length) {
        return { success: false, error: 'INVALID_INPUT' }
    }

    try {
        // IDOR 방어: 입력된 id 가 모두 본인 소유인지 한 번에 확인
        const owned = await prisma.brokerageAccount.findMany({
            where: { id: { in: orderedIds }, userId },
            select: { id: true },
        })
        if (owned.length !== orderedIds.length) {
            return { success: false, error: 'FORBIDDEN' }
        }

        await prisma.$transaction(
            orderedIds.map((id, index) =>
                prisma.brokerageAccount.update({
                    where: { id },
                    data: { displayOrder: index },
                }),
            ),
        )

        await safeCleanup(userId)
        return { success: true }
    } catch (error) {
        console.error('reorderAccounts failed:', error)
        return { success: false, error: 'REORDER_FAILED' }
    }
}

/**
 * 계좌 삭제.
 *
 * - 마지막 계좌도 삭제 허용 (UI 가 경고 표시).
 * - 보유 종목은 onDelete: Cascade 로 동시에 삭제됨.
 * - 삭제 후 사용자에게 계좌가 0개가 되더라도 자동 재생성하지 않는다.
 *   (다음 종목 추가 시도 / 종목 추가 화면 진입 시 ensureUserHasAccount 가 만들어 준다.)
 *
 * @returns deletedHoldingsCount, remainingAccountsCount 반환 — UI 후속 처리용
 */
export async function deleteAccount(
    accountId: string,
): Promise<ActionResult<{ deletedHoldingsCount: number; remainingAccountsCount: number }>> {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'UNAUTHORIZED' }
    const userId = session.user.id

    try {
        await assertAccountOwnership(accountId, userId)

        const result = await prisma.$transaction(async (tx) => {
            const holdingsCount = await tx.holding.count({ where: { accountId } })

            await tx.brokerageAccount.delete({ where: { id: accountId } })

            const remaining = await tx.brokerageAccount.count({ where: { userId } })
            return { deletedHoldingsCount: holdingsCount, remainingAccountsCount: remaining }
        })

        await safeCleanup(userId, true)
        return { success: true, data: result }
    } catch (error) {
        console.error('deleteAccount failed:', error)
        return { success: false, error: 'DELETE_FAILED' }
    }
}

/**
 * 사용자에게 계좌가 한 개도 없을 경우 "기본 계좌" 자동 생성.
 * 클라이언트에서 i18n 라벨을 넘겨받아 사용자 언어에 맞게 만든다.
 *
 * 다른 에이전트(종목 추가 폼 등) 가 진입 시 호출하기 좋은 entry point.
 */
export async function ensureDefaultAccount(
    defaultName: string = '기본 계좌',
): Promise<ActionResult<{ id: string }>> {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'UNAUTHORIZED' }
    const userId = session.user.id

    try {
        const account = await ensureUserHasAccount(userId, defaultName)
        await safeCleanup(userId)
        return { success: true, data: { id: account.id } }
    } catch (error) {
        console.error('ensureDefaultAccount failed:', error)
        return { success: false, error: 'ENSURE_FAILED' }
    }
}
