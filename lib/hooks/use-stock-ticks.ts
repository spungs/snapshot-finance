'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { StockTick } from '@/lib/hooks/use-stock-tick'

export type StockTicksMap = ReadonlyMap<string, StockTick>

interface TargetSubscription {
    code: string
    market: 'KR' | 'US'
}

/**
 * 여러 종목의 실시간 tick 을 구독하는 hook.
 * 워커가 5초마다 전 종목을 묶어 단일 채널 "stock:ticks" 로 broadcast 하면,
 * 그중 구독 대상(subscriptions)에 해당하는 종목만 골라 Map 에 반영한다.
 *
 * @returns Map<stockCode, StockTick> — 아직 tick 안 받은 종목은 Map 에 없음
 */
export function useStockTicks(
    subscriptions: ReadonlyArray<TargetSubscription>,
): StockTicksMap {
    const [ticks, setTicks] = useState<Map<string, StockTick>>(new Map())

    // 관심 종목 집합 — broadcast 핸들러가 ref 로 참조.
    // 덕분에 holdings 가 바뀌어도 채널을 재구독하지 않고 필터만 갱신된다.
    const wantRef = useRef<Set<string>>(new Set())
    const subsKey = JSON.stringify(
        subscriptions.map((s) => `${s.market}:${s.code}`).sort()
    )
    useEffect(() => {
        wantRef.current = new Set(subscriptions.map((s) => `${s.market}:${s.code}`))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subsKey])

    useEffect(() => {
        const sb = getSupabaseClient()
        if (!sb) return

        const channel = sb.channel('stock:ticks', {
            config: { broadcast: { self: false } },
        })

        channel
            .on('broadcast', { event: 'tick' }, ({ payload }) => {
                const incoming = (payload as { ticks?: StockTick[] }).ticks
                if (!incoming?.length) return
                const want = wantRef.current
                setTicks((prev) => {
                    let next: Map<string, StockTick> | null = null
                    for (const t of incoming) {
                        if (!want.has(`${t.market}:${t.code}`)) continue
                        if (!next) next = new Map(prev)
                        next.set(t.code, t)
                    }
                    return next ?? prev
                })
            })
            .subscribe()

        return () => {
            sb.removeChannel(channel).catch(() => { /* unmount cleanup */ })
        }
    }, [])

    return ticks
}
