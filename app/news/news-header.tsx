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
            <p className="max-w-[700px] text-muted-foreground text-lg">
                {language === 'ko'
                    ? <>M7(Magnificent 7) 기업의 최신 뉴스를 AI가 요약해드립니다.<br />바쁜 투자자를 위한 맞춤형 3줄/5줄/10줄 요약 서비스를 경험해보세요.</>
                    : <>AI-powered daily news summaries for Magnificent 7 stocks.<br />Customized 3/5/10-line summaries for busy investors.</>
                }
            </p>
        </div>
    )
}
