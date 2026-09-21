'use client'

import { useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { setActivePortfolio } from '@/app/actions/portfolio-access-actions'
import { suspendSwrPersist } from '@/lib/swr/persist-cache'
import { clearPortfolioScopedCache } from '@/lib/portfolio-scoped-cache'

/**
 * 활성 포트폴리오 전환의 단일 진입점.
 *
 * ⚠️ 전환은 반드시 이 훅으로만 할 것. setActivePortfolio 를 직접 호출하고
 * router.refresh() 로 끝내면 브라우저 캐시가 남아 이전 사용자의 데이터가 그대로 보인다.
 *
 * 실제 사고: 드롭다운(PortfolioSwitcher)만 고치고 배너(ManagedBanner)의
 * "내 포트폴리오로" 버튼을 빠뜨려, 배너로 복귀하면 성과 흐름 그래프만 이전 사람 데이터로
 * 남았다. RSC props 로 내려오는 값은 router.refresh() 로 갱신되지만 SWR 캐시는
 * 그대로였기 때문(앱에서 useSWR 을 쓰는 건 performance-chart 하나뿐이라 그래프만 티가 났다).
 * 로직이 두 곳에 복제돼 있던 게 원인이라 여기로 합쳤다.
 */
export function usePortfolioSwitch() {
    const pathname = usePathname()
    const { cache } = useSWRConfig()
    const [isPending, startTransition] = useTransition()

    /** target: owner userId, 또는 내 포트폴리오로 돌아가려면 'self'. */
    const switchTo = (target: string) => {
        startTransition(async () => {
            const result = await setActivePortfolio(target)
            // grant 가 회수된 경우 등 서버가 전환을 거부하면 쿠키가 바뀌지 않았다.
            // 캐시를 버리거나 이동하면 안 된다 — 화면은 기존 포트폴리오 그대로 둔다.
            if (!result?.success) return

            // 아래 네 단계는 순서가 곧 정확성이다. 바꾸지 말 것.
            //
            // 1) 저장 봉인 — 이후 pagehide/beforeunload 가 stale 캐시를 되살리지 못하게.
            // 2) 메모리 SWR 캐시 비우기 — 봉인이 늦더라도 빈 Map 이 저장되도록.
            // 3) 스토리지의 포트폴리오 종속 키 삭제.
            // 4) 하드 네비게이션 — router.refresh() 는 컴포넌트를 언마운트하지 않아
            //    useState(initial…) 로 들고 있는 로컬 상태가 남의 화면에 그대로 남는다.
            //    전환은 드문 액션이므로 전체 리로드 비용이 정합성보다 싸다.
            suspendSwrPersist()
            for (const key of Array.from(cache.keys())) {
                cache.delete(key)
            }
            clearPortfolioScopedCache()
            window.location.assign(landingPathFor(pathname))
        })
    }

    return { switchTo, isPending }
}

/**
 * 전환 후 착지할 경로. 기본은 "보던 탭 그대로" 지만, URL 에 스냅샷 id 가 박힌 경로는
 * 그 id 가 이전 포트폴리오 소유라 전환 직후 404 가 된다 → 목록으로 되돌린다.
 */
function landingPathFor(pathname: string | null): string {
    if (!pathname) return '/dashboard'
    const m = pathname.match(/^\/dashboard\/snapshots\/([^/]+)/)
    if (m && m[1] !== 'new') return '/dashboard/snapshots'
    return pathname
}
