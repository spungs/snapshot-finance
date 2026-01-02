'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Calculator, PieChart, TrendingUp } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { FormulaCard } from '../_components/formula-card'

export default function ProfitAnalysisPage() {
    const { language } = useLanguage()
    const t = translations[language]

    return (
        <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">
                {/* Hero Section */}
                <section className="w-full py-12 md:py-24 bg-gradient-to-b from-green-50 to-background dark:from-green-950/20 dark:to-background">
                    <div className="container px-4 md:px-6 mx-auto text-center">
                        <div className="inline-block p-3 rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                            <TrendingUp className="h-10 w-10 text-green-600 dark:text-green-400" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">
                            {t.landing.guide3Title}
                        </h1>
                        <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                            {t.landing.guide3Desc}
                        </p>
                    </div>
                </section>

                {/* Formulas Section */}
                <section className="w-full py-12 md:py-24">
                    <div className="container px-4 md:px-6 mx-auto">
                        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                            <FormulaCard
                                title={language === 'ko' ? '평가액 (Valuation)' : 'Valuation'}
                                formula="Price × Quantity"
                                description={language === 'ko' ? '현재 보유 중인 자산의 시장 가치입니다.' : 'The current market value of your assets.'}
                                variables={[
                                    { name: 'Price', desc: language === 'ko' ? '현재가' : 'Current Price' },
                                    { name: 'Quantity', desc: language === 'ko' ? '보유 수량' : 'Qty Held' }
                                ]}
                            />
                            <FormulaCard
                                title={language === 'ko' ? '평가손익 (P/L)' : 'Profit / Loss'}
                                formula="Valuation - Total Cost"
                                description={language === 'ko' ? '투자 원금 대비 현재 이익 또는 손실입니다.' : 'The gain or loss compared to your principal investment.'}
                                variables={[
                                    { name: 'Total Cost', desc: language === 'ko' ? '총 매입금액 (평단가×수량)' : 'Avg Price × Qty' }
                                ]}
                            />
                            <FormulaCard
                                title={language === 'ko' ? '수익률 (Return %)' : 'Return Rate'}
                                formula="(P/L ÷ Total Cost) × 100%"
                                description={language === 'ko' ? '투자 원금 대비 수익의 비율입니다.' : 'The percentage of profit relative to your investment.'}
                            />
                        </div>
                    </div>
                </section>

                {/* Important Notes */}
                <section className="w-full py-12 bg-muted/30">
                    <div className="container px-4 md:px-6 mx-auto">
                        <h2 className="text-2xl font-bold text-center mb-12">
                            {language === 'ko' ? '수익률 해석 시 주의사항' : 'Important Notes'}
                        </h2>
                        <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
                            <div className="space-y-4 p-6 bg-background rounded-xl shadow-sm border">
                                <div className="p-3 bg-orange-100 dark:bg-orange-900/30 w-fit rounded-lg">
                                    <PieChart className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                                </div>
                                <h3 className="text-xl font-semibold">
                                    {language === 'ko' ? '미실현 수익' : 'Unrealized Gains'}
                                </h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    {language === 'ko'
                                        ? '평가손익은 아직 확정되지 않은 수익입니다. 매도하기 전까지는 숫자에 불과합니다.'
                                        : 'Profit/Loss is paper money until you sell. It changes every moment.'}
                                </p>
                            </div>
                            <div className="space-y-4 p-6 bg-background rounded-xl shadow-sm border">
                                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 w-fit rounded-lg">
                                    <Calculator className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                                </div>
                                <h3 className="text-xl font-semibold">
                                    {language === 'ko' ? '세금과 수수료' : 'Taxes & Fees'}
                                </h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    {language === 'ko'
                                        ? '실제 수익은 거래 수수료와 세금(양도소득세 등)을 차감한 후 계산해야 합니다.'
                                        : 'Real profit must deduct trading fees and taxes (e.g., capital gains tax).'}
                                </p>
                            </div>
                            <div className="space-y-4 p-6 bg-background rounded-xl shadow-sm border">
                                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 w-fit rounded-lg">
                                    <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <h3 className="text-xl font-semibold">
                                    {language === 'ko' ? '복리의 마법' : 'Compound Interest'}
                                </h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    {language === 'ko'
                                        ? '수익을 재투자하면 자산이 기하급수적으로 늘어납니다. 장기 투자의 핵심입니다.'
                                        : 'Reinvesting returns grows assets exponentially. It is the key to long-term investing.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Footer Nav */}
                <section className="w-full py-12 border-t">
                    <div className="container px-4 md:px-6 mx-auto text-center">
                        <h2 className="text-2xl font-bold mb-4">
                            {language === 'ko' ? '이제 분석을 시작해볼까요?' : 'Ready to Analyze?'}
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
