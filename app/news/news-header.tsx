'use client'

import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export function NewsHeader() {
    const { language } = useLanguage()
    const t = translations[language].news

    return (
        <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">
                {t.title}
            </h1>
            <p
                className="max-w-[700px] text-muted-foreground text-lg"
                dangerouslySetInnerHTML={{ __html: t.desc }}
            />
        </div>
    )
}
