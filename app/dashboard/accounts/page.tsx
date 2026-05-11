import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AccountsClient } from './accounts-client'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/accounts — 인증 check 만 SSR. 데이터 fetch 는 client (자체 fetch + localStorage L1).
 * 진입 시 SSR DB 쿼리 대기 없이 즉시 mount → localStorage 캐시 표시 → 백그라운드 /api/accounts 갱신.
 * L1 (localStorage SWR) + L2 (accountService Redis) 결합으로 체감 로딩 0ms.
 */
export default async function AccountsPage() {
    const session = await auth()
    if (!session?.user?.id) {
        redirect('/auth/signin')
    }
    return <AccountsClient />
}
