'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { agreeToConsent, declineConsent } from '@/app/actions/consent'

export function ConsentForm() {
    const { language } = useLanguage()
    const t = translations[language].landing

    const [agreedTerms, setAgreedTerms] = useState(false)
    const [agreedPrivacy, setAgreedPrivacy] = useState(false)
    const [isPending, startTransition] = useTransition()
    const allAgreed = agreedTerms && agreedPrivacy

    const toggleAll = (checked: boolean) => {
        setAgreedTerms(checked)
        setAgreedPrivacy(checked)
    }

    const handleSubmit = () => {
        if (!allAgreed || isPending) return
        startTransition(async () => {
            await agreeToConsent()
        })
    }

    const handleDecline = () => {
        if (isPending) return
        startTransition(async () => {
            await declineConsent()
        })
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-xl">{t.consentTitle}</CardTitle>
                <CardDescription>{t.consentDesc}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col space-y-4">
                <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={allAgreed}
                            onChange={(e) => toggleAll(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                        />
                        <span className="font-medium">{t.agreeAll}</span>
                    </label>
                    <div className="h-px bg-border/70" />
                    <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0">
                            <input
                                type="checkbox"
                                checked={agreedTerms}
                                onChange={(e) => setAgreedTerms(e.target.checked)}
                                className="h-4 w-4 accent-primary"
                            />
                            <span className="truncate">{t.agreeTermsCheckbox}</span>
                        </label>
                        <Link
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t.termsOfService}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0">
                            <input
                                type="checkbox"
                                checked={agreedPrivacy}
                                onChange={(e) => setAgreedPrivacy(e.target.checked)}
                                className="h-4 w-4 accent-primary"
                            />
                            <span className="truncate">{t.agreePrivacyCheckbox}</span>
                        </label>
                        <Link
                            href="/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t.privacyPolicy}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Link>
                    </div>
                </div>

                <Button
                    onClick={handleSubmit}
                    disabled={!allAgreed || isPending}
                    className="w-full"
                >
                    {t.consentContinue}
                </Button>

                <Button
                    onClick={handleDecline}
                    disabled={isPending}
                    variant="ghost"
                    className="w-full text-muted-foreground"
                >
                    {language === 'ko' ? '동의하지 않고 로그아웃' : 'Decline and sign out'}
                </Button>

                {!allAgreed && (
                    <p className="text-xs text-muted-foreground text-center">
                        {t.consentRequiredHint}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
