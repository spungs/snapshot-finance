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
 * 여러 종목의 실시간 tick 을 한꺼번에 구독하는 hook.
 * holdings 배열이 변할 때마다 채널을 자동으로 신규 구독/해제 한다.
 *
 * @returns Map<stockCode, StockTick> — 아직 tick 안 받은 종목은 Map 에 없음
 */
export function useStockTicks(
    subscriptions: ReadonlyArray<TargetSubscription>,
): StockTicksMap {
    const [ticks, setTicks] = useState<Map<string, StockTick>>(new Map())

    // 현재 구독한 채널들을 추적 — holdings 배열 변할 때 diff 처리
    const channelsRef = useRef<Map<string, ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']>>>(new Map())

    // 의존성 비교 위한 안정 key — JSON 화 비용 작음 (~수십 종목)
    const subsKey = JSON.stringify(
        subscriptions.map((s) => `${s.market}:${s.code}`).sort()
    )

    useEffect(() => {
        const sb = getSupabaseClient()
        if (!sb) return

        const want = new Set(subscriptions.map((s) => `${s.market}:${s.code}`))
        const current = channelsRef.current

        // 신규 구독
        for (const sub of subscriptions) {
            const channelName = `stock:${sub.market}:${sub.code}`
            if (current.has(channelName)) continue
            const ch = sb.channel(channelName, {
                config: { broadcast: { self: false } },
            })
            ch.on('broadcast', { event: 'tick' }, ({ payload }) => {
                const tick = payload as StockTick
                setTicks((prev) => {
                    const next = new Map(prev)
                    next.set(tick.code, tick)
                    return next
                })
            }).subscribe()
            current.set(channelName, ch)
        }

        // 사라진 구독 해제
        for (const [name, ch] of current) {
            const market = name.split(':')[1] as 'KR' | 'US'
            const code = name.split(':')[2]
            if (want.has(`${market}:${code}`)) continue
            sb.removeChannel(ch).catch(() => { /* ignore */ })
            current.delete(name)
        }

        return () => {
            // 컴포넌트 unmount 시 전부 정리 (StrictMode 의 double mount 도 안전)
            for (const ch of current.values()) {
                sb.removeChannel(ch).catch(() => { /* ignore */ })
            }
            current.clear()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subsKey])

    return ticks
}
