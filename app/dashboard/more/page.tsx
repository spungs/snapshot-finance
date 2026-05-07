'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/translations'
import { ChevronRight, TrendingUp, Sparkle, Newspaper, Settings } from 'lucide-react'

interface MoreItem {
    href: string
    titleKey: TranslationKey
    descKey?: TranslationKey
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}

interface MoreGroup {
    labelKey: TranslationKey
    items: MoreItem[]
}

const GROUPS: MoreGroup[] = [
    {
        labelKey: 'moreGroupTools',
        items: [
            { href: '/dashboard/simulation', titleKey: 'moreSimulationTitle', descKey: 'moreSimulationDesc', icon: TrendingUp },
            { href: '/dashboard/what-if', titleKey: 'moreWhatIfTitle', descKey: 'moreWhatIfDesc', icon: Sparkle },
            { href: '/news', titleKey: 'moreNewsTitle', descKey: 'moreNewsDesc', icon: Newspaper },
        ],
    },
    {
        labelKey: 'moreGroupAccount',
        items: [
            { href: '/dashboard/settings', titleKey: 'tabSettings', icon: Settings },
        ],
    },
]

export default function MorePage() {
    const { t } = useLanguage()

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full">
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[32px] text-foreground">
                    {t('tabMore')}
                </h1>
            </section>

            {GROUPS.map((group) => (
                <div key={group.labelKey} className="mb-6">
                    <div className="eyebrow px-6 mb-2">{t(group.labelKey)}</div>
                    <div className="mx-4 bg-card border border-border">
                        {group.items.map((item, i) => {
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-4 px-5 py-4 hover:bg-card-hover transition-colors min-h-[56px] ${i !== 0 ? 'border-t border-border' : ''}`}
                                >
                                    <div className="w-9 h-9 rounded-sm bg-accent-soft flex items-center justify-center shrink-0">
                                        <Icon className="w-4 h-4 text-primary" strokeWidth={2} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-[15px] font-semibold text-foreground">
                                            {t(item.titleKey)}
                                        </div>
                                        {item.descKey && (
                                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                                {t(item.descKey)}
                                            </div>
                                        )}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </Link>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
