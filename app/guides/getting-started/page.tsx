'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Camera, LineChart, LogIn, Plus } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { StepCard } from '../_components/step-card'

export default function GettingStartedPage() {
    const { language } = useLanguage()
    const t = translations[language]

    const steps = [
        {
            icon: LogIn,
            title: language === 'ko' ? '구글 로그인' : 'Google Login',
            desc: language === 'ko'
                ? '메인 페이지에서 "내 포트폴리오 기록하기" 버튼을 클릭하면 구글 로그인 화면이 나타납니다. 구글 계정으로 간편하게 가입하고 로그인할 수 있습니다.'
                : 'Click "Record Portfolio" on the main page. You can easily sign up and log in with your Google account.'
        },
        {
            icon: Plus,
            title: language === 'ko' ? '보유 종목 추가하기' : 'Add Holdings',
            desc: language === 'ko'
                ? '대시보드에서 "종목 추가" 버튼을 클릭합니다. 한국 주식과 미국 주식 모두 검색할 수 있습니다. 원하는 종목을 선택하고 수량과 평균 매수가를 입력하세요.'
                : 'Click "Add Stock" on the dashboard. Search for Korean or US stocks, select your holdings, and enter quantity and average price.'
        },
        {
            icon: Camera,
            title: language === 'ko' ? '스냅샷 저장하기' : 'Save Snapshot',
            desc: language === 'ko'
                ? '보유 종목 설정이 완료되면 "스냅샷" 탭에서 "새 스냅샷" 버튼을 클릭합니다. 현재 포트폴리오 상태가 자동으로 저장되며, 나중에 언제든 확인할 수 있습니다.'
                : 'Once set up, go to "Snapshots" tab and click "New Snapshot". Your current portfolio state is saved instantly.'
        },
        {
            icon: LineChart,
            title: language === 'ko' ? '수익률 확인하기' : 'Check Returns',
            desc: language === 'ko'
                ? '대시보드에서 현재 평가액, 평가손익, 수익률을 실시간으로 확인할 수 있습니다. 과거 스냅샷과 비교하여 투자 성과를 분석해보세요.'
                : 'View real-time valuation and returns on the dashboard. Compare with past snapshots to analyze performance.'
        }
    ]

    return (
        <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">
                {/* Hero Section */}
                <section className="w-full py-12 md:py-24 bg-gradient-to-b from-blue-50 to-background dark:from-blue-950/20 dark:to-background">
                    <div className="container px-4 md:px-6 mx-auto text-center">
                        <div className="inline-block p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-6">
                            <LogIn className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">
                            {t.landing.guide1Title}
                        </h1>
                        <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                            {t.landing.guide1Desc}
                        </p>
                    </div>
                </section>

                {/* Steps Section */}
                <section className="w-full py-12 md:py-24">
                    <div className="container px-4 md:px-6 mx-auto">
                        <div className="grid gap-8 md:grid-cols-2 lg:gap-12 max-w-5xl mx-auto">
                            {steps.map((step, index) => (
                                <StepCard
                                    key={index}
                                    step={index + 1}
                                    title={step.title}
                                    description={step.desc}
                                    icon={step.icon}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* Call to Action */}
                <section className="w-full py-12 border-t bg-muted/30">
                    <div className="container px-4 md:px-6 mx-auto text-center">
                        <h2 className="text-2xl font-bold mb-4">
                            {language === 'ko' ? '이제 시작해볼까요?' : 'Ready to Start?'}
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
