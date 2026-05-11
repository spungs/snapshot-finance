'use client'

import { useLanguage } from '@/lib/i18n/context'
import { useRelativeTime } from '@/lib/hooks/use-relative-time'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

interface ExchangeRateFootnoteProps {
    rate: number
    /** ISO timestamp 문자열. null/undefined 면 갱신 시각은 표시하지 않음. */
    updatedAt?: string | null
    className?: string
}

/**
 * USD→KRW 환율을 보조 정보(footnote)로 표시. 신뢰성 시그널로 갱신 시각 함께 노출.
 *
 * 사용 위치:
 *   - 홈/포트폴리오 메인 카드 하단 (USD 종목 보유 시)
 *   - 통화 토글 인근
 *
 * 디자인 규약:
 *   - text-xs / muted-foreground 로 위계 낮춤 — 메인 숫자를 압도하지 않음
 *   - 갱신 시각은 1분 단위 상대시간 (방금/3분 전/2시간 전 …)
 */
export function ExchangeRateFootnote({ rate, updatedAt, className }: ExchangeRateFootnoteProps) {
    const { language } = useLanguage()
    const relative = useRelativeTime(updatedAt)

    if (!rate || rate <= 0) return null

    return (
        <div className={cn('text-xs text-muted-foreground numeric', className)}>
            <span>1 USD ≈ {formatCurrency(rate, 'KRW')}</span>
            {relative && (
                <>
                    <span className="mx-1.5 opacity-60">·</span>
                    <span>{language === 'ko' ? `${relative} 갱신` : `updated ${relative}`}</span>
                </>
            )}
        </div>
    )
}

