'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 브라우저 측 Supabase 클라이언트 — Realtime broadcast 수신 전용.
// env 변수 미설정 시 null 반환 → useStockTick 등이 자동 noop 으로 graceful 동작.
// 시세는 공개 정보라 ANON_KEY 만으로 수신 충분 (write 는 워커가 SERVICE_ROLE).

let _client: SupabaseClient | null | undefined

export function getSupabaseClient(): SupabaseClient | null {
    if (_client !== undefined) return _client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
        _client = null
        return null
    }
    _client = createClient(url, anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
        auth: { persistSession: false, autoRefreshToken: false },
    })
    return _client
}
