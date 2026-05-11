'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/lib/i18n/context'

/**
 * ISO timestamp 를 사람이 읽는 상대시간으로 변환 (방금/3분 전/2시간 전/5일 전).
 * 1분 간격으로 자동 재계산. SSR/CSR mismatch 회피 — 첫 렌더는 null, 클라이언트 마운트 후 채움.
 *
 * @param iso ISO 8601 timestamp 문자열. null/undefined/미래면 null 반환.
 */
export function useRelativeTime(iso?: string | null): string | null {
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
