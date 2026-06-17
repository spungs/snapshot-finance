'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/translations'
import { Home, PieChart, Camera, MoreHorizontal } from 'lucide-react'

interface TabDef {
    href: string
    labelKey: TranslationKey
    icon: typeof Home
    exact?: boolean
}

// 4탭으로 통합: 설정은 더보기 안으로 흡수 (5탭 비대칭/라벨 줄바꿈 해소)
const TABS: TabDef[] = [
    { href: '/dashboard', labelKey: 'tabHome', icon: Home, exact: true },
    { href: '/dashboard/portfolio', labelKey: 'tabPortfolio', icon: PieChart },
    { href: '/dashboard/snapshots', labelKey: 'tabSnapshots', icon: Camera },
    { href: '/dashboard/more', labelKey: 'tabMore', icon: MoreHorizontal },
]

export function BottomTabBar() {
    const pathname = usePathname()
    const router = useRouter()
    const { t } = useLanguage()
    const [isPending, startTransition] = useTransition()
    // 클릭 즉시 active 상태 반영 — transition 진행 중에만 사용, 완료되면 pathname 기준으로 자동 복귀
    const [optimisticHref, setOptimisticHref] = useState<string | null>(null)

    // 탭 클릭으로 시작된 전환만 추적 — back/forward 의 스크롤 복원은 건드리지 않는다.
    const tabNavRef = useRef(false)
    // 라우트가 실제로 커밋된 뒤 새 페이지를 최상단에서 시작시킨다.
    // onClick 의 즉시 리셋만으로는 전환(isPending) 중 사용자가 다시 스크롤할 경우
    // 이전 페이지의 스크롤 위치가 남아 레이아웃이 어긋나므로, 커밋 시점에 한 번 더 보정한다.
    useEffect(() => {
        if (!tabNavRef.current) return
        tabNavRef.current = false
        window.scrollTo({ top: 0, behavior: 'instant' })
    }, [pathname])

    const isTabActive = (tab: TabDef, target: string) => {
        return tab.exact ? target === tab.href : target === tab.href || target.startsWith(tab.href + '/')
    }

    return (
        <nav
            aria-label="Primary"
            className={cn(
                'fixed bottom-0 left-0 right-0 z-40',
                'border-t border-border',
                'bg-card/[0.92] backdrop-blur-xl backdrop-saturate-[180%]',
                'pb-[env(safe-area-inset-bottom,0px)]',
            )}
            // iOS Safari: position:fixed + backdrop-filter 조합에서 스크롤 시
            // GPU 컴포지팅 레이어가 꼬여 위치가 밀리는 버그 방지.
            // translateZ(0)으로 독립 레이어를 강제해 고정 위치를 유지한다.
            style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' } as React.CSSProperties}
        >
            <ul className="flex items-stretch justify-around max-w-[480px] mx-auto px-1 pt-2 pb-1.5">
                {TABS.map(tab => {
                    const realActive = isTabActive(tab, pathname)
                    // transition 중일 때만 낙관적 상태 사용, 완료 후엔 pathname 기준
                    const optimisticActive =
                        isPending && optimisticHref ? isTabActive(tab, optimisticHref) : false
                    const isActive = isPending && optimisticHref ? optimisticActive : realActive
                    const Icon = tab.icon
                    return (
                        <li key={tab.href} className="flex-1 min-w-0">
                            <Link
                                href={tab.href}
                                prefetch={true}
                                aria-current={isActive ? 'page' : undefined}
                                onMouseEnter={() => router.prefetch(tab.href)}
                                onTouchStart={() => router.prefetch(tab.href)}
                                onClick={(e) => {
                                    if (realActive) return
                                    e.preventDefault()
                                    tabNavRef.current = true
                                    setOptimisticHref(tab.href)
                                    // 탭 전환 전 스크롤 리셋 — 이전 페이지 스크롤 위치가 전환 중 노출되지 않도록
                                    window.scrollTo({ top: 0, behavior: 'instant' })
                                    startTransition(() => {
                                        router.push(tab.href)
                                    })
                                }}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-colors min-h-[44px]',
                                    isActive ? 'text-primary' : 'text-muted-foreground',
                                    isPending && optimisticActive ? 'opacity-90' : '',
                                )}
                            >
                                <span className="h-[26px] flex items-center justify-center">
                                    <Icon className="w-[22px] h-[22px]" strokeWidth={2} aria-hidden />
                                </span>
                                <span
                                    className={cn(
                                        'text-[10.5px] tracking-tight leading-none',
                                        isActive ? 'font-semibold' : 'font-medium',
                                    )}
                                >
                                    {t(tab.labelKey)}
                                </span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
            {/* 라우트 전환 진행 인디케이터 (상단 1.5px 라인) */}
            <div
                aria-hidden
                className={cn(
                    'absolute left-0 right-0 -top-px h-[1.5px] overflow-hidden pointer-events-none',
                    isPending ? 'opacity-100' : 'opacity-0',
                    'transition-opacity duration-150',
                )}
            >
                <div className="h-full w-full bg-primary animate-indeterminate" />
            </div>
        </nav>
    )
}
