'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export default function TermsPage() {
    const { language } = useLanguage()
    const t = translations[language]
    const router = useRouter()
    const [canGoBack, setCanGoBack] = useState(false)

    useEffect(() => {
        const w = window as any
        const baseLen = typeof w.__base_history_len === 'number' ? w.__base_history_len : 0
        const currentLen = window.history.length

        if (currentLen > baseLen) {
            setCanGoBack(true)
            return
        }

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
                    {canGoBack ? t.terms.back : t.terms.goToMain}
                </Button>
            </div>

            <header className="mb-10">
                <h1 className="text-3xl font-bold tracking-tight mb-2">{t.terms.title}</h1>
                <p className="text-muted-foreground">{t.terms.lastUpdated}</p>
            </header>

            <div className="space-y-8 text-foreground/90 leading-relaxed">
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.terms.section1Title}</h2>
                    <p className="whitespace-pre-line">
                        {t.terms.section1Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.terms.section2Title}</h2>
                    <p className="whitespace-pre-line">
                        {t.terms.section2Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.terms.section3Title}</h2>
                    <p className="whitespace-pre-line">
                        {t.terms.section3Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.terms.section4Title}</h2>
                    <p className="whitespace-pre-line">
                        {t.terms.section4Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.terms.section5Title}</h2>
                    <p className="whitespace-pre-line">
                        {t.terms.section5Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.terms.section6Title}</h2>
                    <p className="whitespace-pre-line">
                        {t.terms.section6Desc}
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3">{t.terms.section7Title}</h2>
                    <p>
                        {t.terms.section7Desc}
                    </p>
                    <p className="mt-2 text-primary font-medium">
                        spungs.dev@gmail.com
                    </p>
                </section>
            </div>
        </div>
    )
}
