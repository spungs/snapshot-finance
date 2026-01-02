'use client'

import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, Minus } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export function InterestSection() {
    const { language } = useLanguage()
    const t = translations[language].whyInvestPage.interest

    return (
        <Card className="w-full bg-slate-50 dark:bg-slate-900 border-none shadow-inner">
            <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">

                    <div className="flex-1 space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{t.nominal}</p>
                        <p className="text-2xl font-bold">2.5%</p>
                    </div>

                    <Minus className="hidden md:block text-muted-foreground" />

                    <div className="flex-1 space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{t.inflation}</p>
                        <p className="text-2xl font-bold text-red-500">2.4%</p>
                    </div>

                    <Minus className="hidden md:block text-muted-foreground" />

                    <div className="flex-1 space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{t.tax}</p>
                        <p className="text-2xl font-bold">15.4%</p>
                    </div>

                    <div className="hidden md:block">
                        <ArrowRight className="text-muted-foreground" />
                    </div>
                    <div className="md:hidden w-full border-t my-2"></div>

                    <div className="flex-1 space-y-1 bg-red-100 dark:bg-red-900/30 p-4 rounded-lg">
                        <p className="text-xs text-red-600 dark:text-red-400 uppercase tracking-wider font-semibold">{t.realReturn}</p>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">-0.1%</p>
                    </div>
                </div>
                <p className="text-center text-sm text-muted-foreground mt-6">
                    {t.descPrefix} <span className="font-bold text-foreground">{t.descHighlight}</span>{t.descSuffix}
                </p>
            </CardContent>
        </Card>
    )
}
