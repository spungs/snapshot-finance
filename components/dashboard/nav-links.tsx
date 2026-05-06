'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { cn } from '@/lib/utils'
import { UserAccountNav } from './user-account-nav'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface NavLinksProps {
    user?: any
}

export function NavLinks({ user }: NavLinksProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { language } = useLanguage()
    const t = translations[language]
    const [isPending, startTransition] = useTransition()
    const [optimisticHref, setOptimisticHref] = useState<string | null>(null)

    // Filter links based on auth status
    // Authenticated User Order: What If -> M7 News -> Why Invest
    const allLinks = [
        { href: '/dashboard', label: t.dashboard, protected: true },
        { href: '/dashboard/snapshots', label: t.snapshots, protected: true },
        { href: '/dashboard/simulation', label: t.simulation, protected: true },
        { href: '/dashboard/what-if', label: t.whatIf, protected: false },
        { href: '/news', label: t.m7News, protected: false },
        { href: '/dashboard/why', label: t.whyInvest, protected: false },
    ]

    // Guest User Order: Why Invest -> What If -> M7 News
    const guestLinks = [
        { href: '/', label: t.home, protected: false },
        { href: '/dashboard/why', label: t.whyInvest, protected: false },
        { href: '/dashboard/what-if', label: t.whatIf, protected: false },
        { href: '/news', label: t.m7News, protected: false },
    ]

    const links = user
        ? allLinks
        : guestLinks

    return (
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-hide items-center relative">
            {links.map((link) => {
                const realActive = pathname === link.href
                const optimisticActive = isPending && optimisticHref === link.href
                const isActive = isPending && optimisticHref ? optimisticActive : realActive
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        prefetch={true}
                        onMouseEnter={() => router.prefetch(link.href)}
                        onTouchStart={() => router.prefetch(link.href)}
                        onClick={(e) => {
                            if (realActive) return
                            e.preventDefault()
                            setOptimisticHref(link.href)
                            startTransition(() => {
                                router.push(link.href)
                            })
                        }}
                        className={cn(
                            'px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors',
                            isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                            isPending && optimisticActive ? 'opacity-90' : '',
                        )}
                    >
                        {link.label}
                    </Link>
                )
            })}

            <div className="flex items-center gap-2 pl-2 border-l ml-2">
                <ThemeToggle />
                {user ? (
                    <UserAccountNav user={user} />
                ) : (
                    <Link
                        href="/dashboard"
                        prefetch={true}
                        className="px-2 sm:px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground text-xs sm:text-sm font-medium"
                    >
                        {t.landing.login}
                    </Link>
                )}
            </div>

            {/* 라우트 전환 진행 인디케이터 */}
            <div
                aria-hidden
                className={cn(
                    'absolute left-0 right-0 -bottom-px h-[1.5px] overflow-hidden pointer-events-none',
                    isPending ? 'opacity-100' : 'opacity-0',
                    'transition-opacity duration-150',
                )}
            >
                <div className="h-full w-full bg-primary animate-indeterminate" />
            </div>
        </nav>
    )
}
