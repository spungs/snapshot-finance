'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { Home, PieChart, Camera, MoreHorizontal, Settings } from 'lucide-react'

interface TabDef {
    href: string
    labelKey: string
    icon: typeof Home
    exact?: boolean
}

const TABS: TabDef[] = [
    { href: '/dashboard', labelKey: 'tabHome', icon: Home, exact: true },
    { href: '/dashboard/portfolio', labelKey: 'tabPortfolio', icon: PieChart },
    { href: '/dashboard/snapshots', labelKey: 'tabSnapshots', icon: Camera },
    { href: '/dashboard/more', labelKey: 'tabMore', icon: MoreHorizontal },
    { href: '/dashboard/settings', labelKey: 'tabSettings', icon: Settings },
]

export function BottomTabBar() {
    const pathname = usePathname()
    const { t } = useLanguage()

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
                    const isActive = tab.exact
                        ? pathname === tab.href
                        : pathname === tab.href || pathname.startsWith(tab.href + '/')
                    const Icon = tab.icon
                    return (
                        <li key={tab.href} className="flex-1 min-w-0">
                            <Link
                                href={tab.href}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-colors',
                                    isActive ? 'text-primary' : 'text-muted-foreground',
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
                                    {t(tab.labelKey as any)}
                                </span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}
