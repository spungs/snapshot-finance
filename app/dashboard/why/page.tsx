'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { InflationSection } from './_components/inflation-section'
import { InterestSection } from './_components/interest-section'
import { CompoundChart } from './_components/compound-chart'
import { SimulationChart } from './_components/simulation-chart'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export default function WhyInvestPage() {
    const { language } = useLanguage()
    const t = translations[language].whyInvestPage

    return (
        <div className="container mx-auto p-4 space-y-8 max-w-4xl pb-20">
            <div className="space-y-4 text-center py-8">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.title}</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    {t.subtitle}
                </p>
            </div>

            <section className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold">1</span>
                    <h2 className="text-2xl font-bold">{t.inflation.title}</h2>
                </div>
                <InflationSection />
                <div className="pt-4">
                    <InterestSection />
                </div>
            </section>

            <section className="space-y-4 pt-8">
                <div className="flex items-center gap-2 mb-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 font-bold">2</span>
                    <h2 className="text-2xl font-bold">{t.compound.title}</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
                    <CompoundChart />
                </div>
                <Alert className="bg-muted/50 border-none">
                    <Info className="h-4 w-4" />
                    <AlertTitle>{t.compound.alertTitle}</AlertTitle>
                    <AlertDescription>
                        {t.compound.alertDesc}
                    </AlertDescription>
                </Alert>
            </section>

            <section className="space-y-4 pt-8">
                <div className="flex items-center gap-2 mb-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 font-bold">3</span>
                    <h2 className="text-2xl font-bold">{t.simulation.title}</h2>
                </div>
                <SimulationChart />
                <Card className="bg-secondary/20 border-none">
                    <CardContent className="pt-6">
                        <blockquote className="border-l-4 border-gray-300 pl-4 italic text-muted-foreground">
                            {t.simulation.quote}
                            <footer className="text-sm font-bold text-foreground mt-2">{t.simulation.quoteAuthor}</footer>
                        </blockquote>
                    </CardContent>
                </Card>
            </section>

            <section className="pt-12 text-center space-y-6">
                <h2 className="text-2xl font-bold">{t.cta.title}</h2>
                <p className="text-muted-foreground">
                    {t.cta.desc}
                </p>
            </section>
        </div>
    )
}
