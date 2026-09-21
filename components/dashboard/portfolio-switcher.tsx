'use client'

import { useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { Check, ChevronDown, Loader2, Users } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { setActivePortfolio } from '@/app/actions/portfolio-access-actions'
import { PortfolioSwitchProgress } from '@/components/dashboard/portfolio-switch-progress'
import { suspendSwrPersist } from '@/lib/swr/persist-cache'
import { clearPortfolioScopedCache } from '@/lib/portfolio-scoped-cache'

type ManagedPortfolio = { ownerId: string; name: string }

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

interface PortfolioSwitcherProps {
    /** 로그인한 사람(나)의 표시명 — "내 포트폴리오" 라벨 옆에 사용. */
    selfName?: string | null
    /** 내가 위임받아 관리 가능한 owner 목록. 비어있으면 이 컴포넌트는 렌더되지 않음(layout 가드). */
    managed: ManagedPortfolio[]
    /** 현재 관리 중인 owner id. null 이면 내 포트폴리오. */
    activeOwnerId: string | null
}

export function PortfolioSwitcher({ selfName, managed, activeOwnerId }: PortfolioSwitcherProps) {
    const pathname = usePathname()
    const { cache } = useSWRConfig()
    const [isPending, startTransition] = useTransition()

    const activeLabel = activeOwnerId
        ? managed.find((m) => m.ownerId === activeOwnerId)?.name ?? '관리 중'
        : (selfName || '내 포트폴리오')

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

    return (
        <>
            {isPending && <PortfolioSwitchProgress />}
            <DropdownMenu>
                <DropdownMenuTrigger
                    disabled={isPending}
                    aria-busy={isPending}
                    className="flex items-center gap-1 rounded-full border border-border px-2.5 h-9 text-sm text-foreground disabled:opacity-60"
                    aria-label="포트폴리오 전환"
                >
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[7rem] truncate">{activeLabel}</span>
                    {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                    <DropdownMenuLabel>포트폴리오 선택</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => switchTo('self')} className="justify-between">
                        <span className="truncate">{selfName || '내 포트폴리오'}</span>
                        {activeOwnerId === null && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                    {managed.map((m) => (
                        <DropdownMenuItem
                            key={m.ownerId}
                            onClick={() => switchTo(m.ownerId)}
                            className="justify-between"
                        >
                            <span className="truncate">{m.name}</span>
                            {activeOwnerId === m.ownerId && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    )
}
