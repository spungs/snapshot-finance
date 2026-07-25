'use server'

import { signOut } from '@/lib/auth'
import { getPortfolioContext } from '@/lib/portfolio-context'
import { prisma } from '@/lib/prisma'

export async function deleteAccount() {
    const ctx = await getPortfolioContext()

    if (!ctx) {
        throw new Error('Not authenticated')
    }

    // 안전장치: 다른 사람 포트폴리오를 관리하는 중에는 회원 탈퇴를 차단한다.
    // 탈퇴는 항상 로그인한 나(actor) 자신에게만 적용되므로, 관리 모드에서 실수로
    // "남의 것을 지운다"고 오인해 내 계정을 삭제하는 사고를 원천 차단.
    if (ctx.isManaging) {
        throw new Error('다른 사람의 포트폴리오를 관리하는 중에는 회원 탈퇴를 할 수 없습니다. 내 포트폴리오로 전환 후 다시 시도해주세요.')
    }

    try {
        // Delete user (Cascasding deletes will handle related data like Holdings, Accounts, Snapshots)
        await prisma.user.update({
            where: {
                id: ctx.actorId,
            },
            data: {
                deletedAt: new Date(),
            },
        })

        // Sign out is handled after this returns or we can do it here if redirect happens
        // However, signOut() in server action might throw redirect, so we should do it last
    } catch (error) {
        console.error('Failed to delete account:', error)
        throw new Error('Failed to delete account')
    }

    await signOut({ redirectTo: '/' })
}
