'use client'

import { useRelativeTime } from '@/lib/hooks/use-relative-time'
import { isAnyMarketOpen, type Market } from '@/lib/utils/market-hours'

const STALE_THRESHOLD_MS = 5 * 60_000

/**
 * 가격 신선도 표시.
 *  - 장 중 + 5분 이내 신선: 노이즈 줄이려 표시 안 함 (null)
 *  - 장 중 + 5분 이상 stale: "주가 N분 전 · 시세 지연" (실제 문제 상황)
 *  - 장 마감 (평일 시간 외): "장 마감"
 *  - 휴장 (주말): "휴장"
 *
 * iso 가 그룹 내 가장 오래된 priceUpdatedAt, markets 가 그룹 내 보유 종목 시장 집합.
 */
export function PriceUpdatedFootnote({
    iso, language, markets,
}: {
    iso: string | null
    language: 'ko' | 'en'
    markets: Market[]
}) {
    const relative = useRelativeTime(iso)
    const anyOpen = isAnyMarketOpen(markets)

    if (anyOpen) {
        if (!iso) return null
        const age = Date.now() - new Date(iso).getTime()
        if (!Number.isFinite(age) || age < STALE_THRESHOLD_MS) return null
        if (!relative) return null
        return (
            <span className="text-[10px] text-loss/70 truncate">
                {language === 'ko' ? `주가 ${relative} · 시세 지연` : `Price ${relative} · delayed`}
            </span>
        )
    }

    // 장 마감 — 평일 시간 외와 주말 구분
    const dow = new Date().getDay()
    const isWeekend = dow === 0 || dow === 6
    return (
        <span className="text-[10px] text-muted-foreground truncate">
            {isWeekend
                ? (language === 'ko' ? '휴장' : 'Closed')
                : (language === 'ko' ? '장 마감' : 'Market closed')}
        </span>
    )
}
