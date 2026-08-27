'use client'

import { SWRConfig } from 'swr'
import { localStorageProvider } from '@/lib/swr/persist-cache'

// 응답 envelope { success, data, error } 를 해제해 SWR data 로 노출.
//
// 키는 문자열 또는 ['<url>', ...스코프] 배열. SWR v2 는 배열 키를 spread 하지 않고
// 배열 그대로 fetcher 에 넘기므로(v1 과 다름) 첫 요소를 URL 로 해석한다.
// 배열 키는 "URL 은 같지만 응답 주체가 다른" 경우(예: 위임 포트폴리오 — active_portfolio
// 쿠키에 따라 응답이 달라짐)에 캐시를 분리하는 용도.
async function defaultFetcher(key: string | [string, ...unknown[]]) {
    const url = Array.isArray(key) ? key[0] : key
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
