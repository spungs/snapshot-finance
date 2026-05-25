import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { accountService } from '@/lib/services/account-service'
import { AccountsClient } from './accounts-client'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/accounts — 계좌 목록을 SSR 로 직접 렌더해 첫 페인트부터 표시(깜빡임 0).
 * accountService 가 L2(Redis) 캐시를 내장해 SSR 쿼리도 빠름.
 */
export default async function AccountsPage() {
    const session = await auth()
    if (!session?.user?.id) {
        redirect('/auth/signin')
    }
    const accounts = await accountService.getList(session.user.id)
    return <AccountsClient initialAccounts={accounts} />
}
