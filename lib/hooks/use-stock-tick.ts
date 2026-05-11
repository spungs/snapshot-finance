'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'

export interface StockTick {
    code: string
    market: 'KR' | 'US'
    price: number
    change: number
    changeRate: number
    time: string  // HHMMSS
    ts: number    // 워커가 받은 시점 (Date.now())
}

/**
 * 특정 종목의 실시간 tick 을 구독하는 hook.
 * Supabase Realtime channel "stock:{market}:{code}" 의 broadcast 이벤트 "tick" 을 받는다.
 *
 * env 변수 미설정 시 null 반환 → 기존 SSR currentPrice 그대로 사용 (graceful fallback).
 *
 * @param code 종목 코드 (예: '005930', 'AAPL')
 * @param market 거래소 ('KR' | 'US')
 * @returns 최신 tick 또는 null (아직 수신 안 됨/구독 불가)
 */
export function useStockTick(code: string | null | undefined, market: 'KR' | 'US' | null | undefined): StockTick | null {
    const [tick, setTick] = useState<StockTick | null>(null)

    useEffect(() => {
        if (!code || !market) return
        const sb = getSupabaseClient()
        if (!sb) return

        const channelName = `stock:${market}:${code}`
        const channel = sb.channel(channelName, {
            config: { broadcast: { self: false } },
        })

        channel
            .on('broadcast', { event: 'tick' }, ({ payload }) => {
                setTick(payload as StockTick)
            })
            .subscribe()

        return () => {
            sb.removeChannel(channel).catch(() => { /* unmount cleanup */ })
        }
    }, [code, market])

    return tick
}
