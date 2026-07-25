import { getPortfolioContext } from '@/lib/portfolio-context'
import { redirect } from 'next/navigation'
import { accountService } from '@/lib/services/account-service'
import { AccountsClient } from './accounts-client'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/accounts — 계좌 목록을 SSR 로 직접 렌더해 첫 페인트부터 표시(깜빡임 0).
 * accountService 가 L2(Redis) 캐시를 내장해 SSR 쿼리도 빠름.
 */
export default async function AccountsPage() {
    const ctx = await getPortfolioContext()
    if (!ctx) {
        redirect('/auth/signin')
    }
    const accounts = await accountService.getList(ctx.portfolioUserId)
    return <AccountsClient initialAccounts={accounts} />
}
