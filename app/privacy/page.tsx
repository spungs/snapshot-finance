'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export default function PrivacyPage() {
    const { language } = useLanguage()
    const t = translations[language]
    const router = useRouter()
    const [canGoBack, setCanGoBack] = useState(false)

    useEffect(() => {
        // 1. Check internal history using base length captured at app start
        const w = window as any
        const baseLen = typeof w.__base_history_len === 'number' ? w.__base_history_len : 0
        const currentLen = window.history.length

        if (currentLen > baseLen) {
            setCanGoBack(true)
            return
        }

        // 2. Fallback: Check if referrer exists and is from the same origin (for MPA transitions or refresh scenarios)
        if (typeof document !== 'undefined' && document.referrer) {
            try {
                const referrerUrl = new URL(document.referrer)
                const currentOrigin = window.location.origin
                setCanGoBack(referrerUrl.origin === currentOrigin)
            } catch (e) {
                setCanGoBack(false)
            }
        } else {
            setCanGoBack(false)
        }
    }, [])

    const handleBack = () => {
        if (canGoBack) {
            router.back()
        } else {
            router.push('/')
        }
    }

    return (
        <div className="min-h-screen bg-background p-6 md:p-12 max-w-3xl mx-auto">
            <div className="inline-block mb-8">
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 pl-0 hover:pl-2 transition-all"
                    onClick={handleBack}
                >
                    <ArrowLeft className="w-4 h-4" />
                    {canGoBack ? t.privacy.back : t.privacy.goToMain}
                </Button>
            </div>

            <header className="mb-10">
                <h1 className="text-3xl font-bold tracking-tight mb-2">{t.privacy.title}</h1>
                <p className="text-muted-foreground">{t.privacy.lastUpdated}</p>
            </header>

            <div className="space-y-8 text-foreground/90 leading-relaxed">
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.privacy.section1Title}</h2>
                    <p className="whitespace-pre-line">
                        {t.privacy.section1Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.privacy.section2Title}</h2>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>{t.privacy.section2Item1.split(':')[0]}:</strong> {t.privacy.section2Item1.split(':')[1]}</li>
                        <li><strong>{t.privacy.section2Item2.split(':')[0]}:</strong> {t.privacy.section2Item2.split(':')[1]}</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.privacy.section3Title}</h2>
                    <p>{t.privacy.section3Desc}</p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                        <li>{t.privacy.section3Item1}</li>
                        <li>{t.privacy.section3Item2}</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.privacy.section4Title}</h2>
                    <p className="whitespace-pre-line">
                        {t.privacy.section4Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.privacy.section5Title}</h2>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>{t.privacy.section5Item1.split(':')[0]}:</strong> {t.privacy.section5Item1.split(':')[1]}</li>
                        <li><strong>{t.privacy.section5Item2.split(':')[0]}:</strong> {t.privacy.section5Item2.split(':')[1]}
                            <ul className="list-circle pl-5 mt-1 text-sm text-muted-foreground">
                                <li>{t.privacy.section5SubItem1}</li>
                                <li>
                                    {language === 'ko'
                                        ? <>사용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으며, <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Google 광고 설정</a>에서 맞춤형 광고를 해제할 수 있습니다.</>
                                        : <>Users can refuse cookie storage through browser settings and opt-out of personalized ads in <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Google Ad Settings</a>.</>
                                    }
                                </li>
                            </ul>
                        </li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.privacy.section6Title}</h2>
                    <p>
                        {t.privacy.section6Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.privacy.section7Title}</h2>
                    <p>
                        {t.privacy.section7Desc}
                    </p>
                    <p className="mt-2 text-primary font-medium">
                        spungs.dev@gmail.com
                    </p>
                </section>
            </div>
        </div>
    )
}
