'use client'

import { SWRConfig } from 'swr'
import { localStorageProvider } from '@/lib/swr/persist-cache'

// 응답 envelope { success, data, error } 를 해제해 SWR data 로 노출.
async function defaultFetcher(url: string) {
    const res = await fetch(url)
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
    }
    const json = await res.json()
    if (json && typeof json === 'object' && 'success' in json) {
        if (!json.success) throw new Error(json.error?.message || 'fetch failed')
        return json.data
    }
    return json
}

// dashboard 전체에 SWR 캐시를 공유시킨다.
// - localStorageProvider 로 세션 간 캐시 영속화 (재방문 시 즉시 표시)
// - revalidateOnFocus: 탭 복귀 시 백그라운드 재검증 (stale-while-revalidate)
// - dedupingInterval: 짧은 간격의 중복 요청 합치기
export function SWRProvider({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                provider: localStorageProvider,
                fetcher: defaultFetcher,
                revalidateOnFocus: true,
                revalidateOnReconnect: true,
                dedupingInterval: 5000,
            }}
        >
            {children}
        </SWRConfig>
    )
}
