import { getPortfolioContext, listManagedPortfolios } from '@/lib/portfolio-context'
import { MoreClient } from './more-client'

// '추이 비교' 항목은 위임 grant 를 받은 사용자(나)에게만 노출 — 일반 사용자는 화면 무변화.
export default async function MorePage() {
    const ctx = await getPortfolioContext()
    const managed = ctx ? await listManagedPortfolios(ctx.actorId) : []
    return <MoreClient showCompare={managed.length > 0} />
}
