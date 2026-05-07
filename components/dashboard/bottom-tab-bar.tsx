'use client'

import { useState, useTransition } from 'react'
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
                                    setOptimisticHref(tab.href)
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
