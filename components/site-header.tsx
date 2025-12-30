'use client'

import Link from 'next/link'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MobileNav } from '@/components/mobile-nav'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export function SiteHeader() {
    const { language } = useLanguage()
    const t = translations[language]

    return (
        <header className="px-4 lg:px-6 h-14 flex items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 justify-between">
            <Link className="flex items-center justify-center font-bold text-xl" href="/">
                <Camera className="mr-2 h-6 w-6" />
                Snapshot Finance
            </Link>
            <nav className="hidden sm:flex ml-auto gap-4 sm:gap-6 items-center">
                <Link className="text-sm font-medium hover:underline underline-offset-4" href="/#about">
                    {t.landing.about}
                </Link>
                <Link className="text-sm font-medium hover:underline underline-offset-4" href="/#features">
                    {t.landing.features}
                </Link>
                <Link className="text-sm font-medium hover:underline underline-offset-4" href="/guides">
                    {t.landing.guides}
                </Link>
                <Link className="text-sm font-medium hover:underline underline-offset-4" href="/dashboard/what-if">
                    {translations[language].whatIf}
                </Link>
                <Link href="/dashboard">
                    <Button variant="outline" size="sm">
                        {t.landing.login}
                    </Button>
                </Link>
            </nav>
            <MobileNav type="landing" />
        </header>
    )
}
