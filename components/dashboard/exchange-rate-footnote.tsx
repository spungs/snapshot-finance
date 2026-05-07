'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/lib/i18n/context'
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

/**
 * 1분 간격으로 자동 재계산되는 상대시간. iso 가 없거나 미래면 null.
 * SSR/CSR mismatch 회피: 첫 렌더에서는 빈 값, 클라이언트 마운트 후 1회 채워넣음.
 */
function useRelativeTime(iso?: string | null): string | null {
    const { language } = useLanguage()
    const [now, setNow] = useState<number | null>(null)

    useEffect(() => {
        if (!iso) return
        setNow(Date.now())
        const id = setInterval(() => setNow(Date.now()), 60_000)
        return () => clearInterval(id)
    }, [iso])

    if (!iso || now === null) return null
    const ms = now - new Date(iso).getTime()
    if (!Number.isFinite(ms) || ms < 0) return null

    const min = Math.floor(ms / 60_000)
    const ko = language === 'ko'
    if (min < 1) return ko ? '방금' : 'just now'
    if (min < 60) return ko ? `${min}분 전` : `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return ko ? `${hr}시간 전` : `${hr}h ago`
    const day = Math.floor(hr / 24)
    return ko ? `${day}일 전` : `${day}d ago`
}
