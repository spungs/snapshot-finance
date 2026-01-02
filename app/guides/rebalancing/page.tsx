'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ArrowRight, Scale, Calendar, DollarSign, Percent } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export default function RebalancingPage() {
    const { language } = useLanguage()
    const t = translations[language]

    const methods = [
        {
            icon: Calendar,
            title: language === 'ko' ? '시간 기준 (Time-Based)' : 'Time-Based',
            desc: language === 'ko'
                ? '정해진 주기(분기, 반기, 연)마다 리밸런싱합니다. 단순하고 실행하기 쉽지만, 시장 상황과 무관하게 진행된다는 단점이 있습니다.'
                : 'Rebalance at set intervals (quarterly, annually). Simple to execute, but ignores market conditions.'
        },
        {
            icon: Percent,
            title: language === 'ko' ? '비중 기준 (Threshold)' : 'Threshold-Based',
            desc: language === 'ko'
                ? '목표 비중에서 5% 이상 벗어나면 리밸런싱합니다. 필요할 때만 거래하지만, 지속적인 모니터링이 필요합니다.'
                : 'Rebalance when weights deviate by >5%. Trades only when needed, but requires constant monitoring.'
        },
        {
            icon: DollarSign,
            title: language === 'ko' ? '현금 흐름 (Cash Flow)' : 'Cash Flow',
            desc: language === 'ko'
                ? '추가 투자금으로 비중이 낮은 자산을 매수합니다. 매도 없이 리밸런싱이 가능하지만, 큰 비중 차이는 해소하기 어렵습니다.'
                : 'Buy underweight assets with new money. No selling required, but hard to fix large deviations.'
        }
    ]

    return (
        <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">
                {/* Hero Section */}
                <section className="w-full py-12 md:py-24 bg-gradient-to-b from-purple-50 to-background dark:from-purple-950/20 dark:to-background">
                    <div className="container px-4 md:px-6 mx-auto text-center">
                        <div className="inline-block p-3 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-6">
                            <Scale className="h-10 w-10 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">
                            {t.landing.guide2Title}
                        </h1>
                        <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                            {t.landing.guide2Desc}
                        </p>
                    </div>
                </section>

                {/* Methods Section */}
                <section className="w-full py-12 md:py-24">
                    <div className="container px-4 md:px-6 mx-auto">
                        <h2 className="text-2xl font-bold text-center mb-12">
                            {language === 'ko' ? '리밸런싱 방법 3가지' : '3 Rebalancing Methods'}
                        </h2>
                        <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
                            {methods.map((method, index) => {
                                const Icon = method.icon
                                return (
                                    <Card key={index} className="flex flex-col items-center text-center p-6 border-none shadow-lg bg-card/50 backdrop-blur-sm transition-all hover:scale-105">
                                        <CardHeader className="p-0 pb-4 flex flex-col items-center">
                                            <div className="p-3 rounded-full bg-muted">
                                                <Icon className="h-8 w-8 text-foreground" />
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-0 space-y-2">
                                            <CardTitle>{method.title}</CardTitle>
                                            <p className="text-base text-muted-foreground leading-relaxed text-balance break-keep">
                                                {method.desc}
                                            </p>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                </section>

                {/* Why Rebalance */}
                <section className="w-full py-12 bg-muted/30">
                    <div className="container px-4 md:px-6 mx-auto grid gap-12 lg:grid-cols-2 items-center max-w-5xl">
                        <div className="space-y-4">
                            <h2 className="text-3xl font-bold tracking-tighter">
                                {language === 'ko' ? '왜 리밸런싱이 필요한가요?' : 'Why Rebalance?'}
                            </h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                {language === 'ko'
                                    ? '리밸런싱은 "고점에 팔고 저점에 사는" 가장 확실한 방법입니다. 감정에 휘둘리지 않고 원래의 투자 계획을 유지하게 해줍니다. 이를 통해 포트폴리오의 변동성을 줄이고 장기 수익률을 개선할 수 있습니다.'
                                    : 'Rebalancing is the surest way to "buy low and sell high". It keeps you disciplined and aligned with your original plan, reducing volatility and improving long-term returns.'}
                            </p>
                        </div>
                        <div className="bg-background rounded-xl p-8 shadow-sm border">
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 bg-green-100 dark:bg-green-900/30 p-1 rounded">
                                        <ArrowRight className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    </div>
                                    <span className="font-medium">{language === 'ko' ? '리스크 관리 (과도한 쏠림 방지)' : 'Risk Management'}</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 bg-green-100 dark:bg-green-900/30 p-1 rounded">
                                        <ArrowRight className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    </div>
                                    <span className="font-medium">{language === 'ko' ? '자동적인 이익 실현' : 'Automatic Profit Taking'}</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 bg-green-100 dark:bg-green-900/30 p-1 rounded">
                                        <ArrowRight className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    </div>
                                    <span className="font-medium">{language === 'ko' ? '심리적 안정감 유지' : 'Psychological Stability'}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Footer Nav */}
                <section className="w-full py-12 border-t">
                    <div className="container px-4 md:px-6 mx-auto text-center">
                        <h2 className="text-2xl font-bold mb-4">
                            {language === 'ko' ? '리밸런싱을 시작해볼까요?' : 'Ready to Rebalance?'}
                        </h2>
                        <div className="flex justify-center gap-4">
                            <Link href="/guides">
                                <Button variant="outline" className="gap-2">
                                    <ArrowLeft className="h-4 w-4" />
                                    {language === 'ko' ? '가이드 목록' : 'Back to Guides'}
                                </Button>
                            </Link>
                            <Link href="/dashboard">
                                <Button className="gap-2">
                                    {t.landing.start}
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    )
}
