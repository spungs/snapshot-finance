import { prisma } from '@/lib/prisma'

// PRO 자격 단일 진실 — UI/API 양쪽에서 재사용.
// admin 은 결제 흐름과 무관하게 PRO 권한을 자동 부여 (운영/QA 편의).
export async function isProUser(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            role: true,
            subscription: {
                select: {
                    plan: true,
                    status: true,
                    currentPeriodEnd: true,
                },
            },
        },
    })

    if (!user) return false
    if (user.role === 'admin') return true

    const sub = user.subscription
    if (!sub) return false
    if (sub.plan !== 'PRO') return false
    if (sub.status !== 'ACTIVE') return false
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) return false

    return true
}
