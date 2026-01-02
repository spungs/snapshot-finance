'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export function InflationSection() {
    const { language } = useLanguage()
    const t = translations[language].whyInvestPage.inflation

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>{t.currentRateTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-center py-6">
                        <span className="text-5xl font-bold tracking-tighter text-red-500">2.4%</span>
                        <p className="text-muted-foreground mt-2">{t.targetExceeded}</p>
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                        {t.desc}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t.perceivedInflation}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>{t.processedFood}</span>
                            <span className="font-bold text-red-500">+4.6%</span>
                        </div>
                        <Progress value={46} className="h-2" />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>{t.eatingOut}</span>
                            <span className="font-bold text-red-500">+4.7%</span>
                        </div>
                        <Progress value={47} className="h-2" />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>{t.communication}</span>
                            <span className="font-bold text-red-500">+11.9%</span>
                        </div>
                        <Progress value={100} className="h-2 bg-red-100 dark:bg-red-900/20" />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
