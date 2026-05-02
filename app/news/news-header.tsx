'use client'

import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export function NewsHeader() {
    const { language } = useLanguage()
    const t = translations[language].news

    return (
        <header className="mb-8 border-l-[3px] border-l-primary pl-5 py-2">
            <div className="eyebrow mb-2">{t.m7Eyebrow}</div>
            <h1 className="hero-serif text-[32px] sm:text-[40px] text-foreground leading-tight">
                {t.title}
            </h1>
            <p className="mt-3 text-muted-foreground max-w-[640px] leading-relaxed">
                {language === 'ko'
                    ? <>보유 종목과 M7 기업의 최신 뉴스를 AI가 3줄·5줄·10줄로 요약해드립니다.</>
                    : <>AI summarizes the latest news for your holdings and the M7 in 3, 5, or 10 lines.</>
                }
            </p>
        </header>
    )
}
