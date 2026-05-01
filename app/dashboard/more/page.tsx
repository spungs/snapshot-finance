'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/context'
import { ChevronRight, TrendingUp, Sparkle, Newspaper } from 'lucide-react'

interface MoreItem {
    href: string
    titleKey: string
    descKey: string
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}

const ITEMS: MoreItem[] = [
    { href: '/dashboard/simulation', titleKey: 'moreSimulationTitle', descKey: 'moreSimulationDesc', icon: TrendingUp },
    { href: '/dashboard/what-if', titleKey: 'moreWhatIfTitle', descKey: 'moreWhatIfDesc', icon: Sparkle },
    { href: '/news', titleKey: 'moreNewsTitle', descKey: 'moreNewsDesc', icon: Newspaper },
]

export default function MorePage() {
    const { t } = useLanguage()

    return (
        <div className="max-w-[480px] mx-auto w-full">
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[32px] text-foreground">
                    {t('tabMore')}
                </h1>
            </section>

            <div className="mx-4 bg-card border border-border">
                {ITEMS.map((item, i) => {
                    const Icon = item.icon
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-4 px-5 py-4 hover:bg-card-hover transition-colors ${i !== 0 ? 'border-t border-border' : ''}`}
                        >
                            <div className="w-9 h-9 rounded-sm bg-accent-soft flex items-center justify-center shrink-0">
                                <Icon className="w-4 h-4 text-primary" strokeWidth={2} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-serif text-[15px] font-semibold text-foreground">
                                    {t(item.titleKey as any)}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                    {t(item.descKey as any)}
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
