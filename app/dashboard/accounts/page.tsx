import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AccountsClient } from './accounts-client'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
    const session = await auth()
    if (!session?.user?.id) {
        redirect('/auth/signin')
    }
    const userId = session.user.id

    // 사용자의 모든 계좌 + 각 계좌별 보유 종목 수 (Cascade 삭제 시 영향 미리보기용)
    const accounts = await prisma.brokerageAccount.findMany({
        where: { userId },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
            id: true,
            name: true,
            displayOrder: true,
            _count: { select: { holdings: true } },
        },
    })

    const initialAccounts = accounts.map((a) => ({
        id: a.id,
        name: a.name,
        displayOrder: a.displayOrder,
        holdingsCount: a._count.holdings,
    }))

    return <AccountsClient initialAccounts={initialAccounts} />
}
