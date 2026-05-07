'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export function SiteFooter() {
    const { language } = useLanguage()
    const t = translations[language]

    return (
        <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t font-medium bg-background">
            <p className="text-xs text-muted-foreground">
                {t.landing.copyRight}
            </p>
            <nav className="sm:ml-auto flex gap-4 sm:gap-6">
                <Link className="text-xs hover:underline underline-offset-4 text-muted-foreground" href="/terms">
                    {t.landing.termsOfService}
                </Link>
                <Link className="text-xs hover:underline underline-offset-4 text-muted-foreground" href="/privacy">
                    {t.landing.privacyPolicy}
                </Link>
            </nav>
        </footer>
    )
}
