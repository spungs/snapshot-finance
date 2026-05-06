// SWR 캐시를 localStorage 에 영속화한다.
// - 마운트 시 localStorage 에서 직렬화된 Map 복원 → 첫 페인트가 캐시 데이터로 시작
// - beforeunload 에서 현재 캐시를 localStorage 에 저장
// - 동일 사용자가 탭/세션을 닫고 다시 열어도 마지막 데이터 즉시 표시
//
// SWR 공식 문서의 표준 패턴: https://swr.vercel.app/docs/advanced/cache

const STORAGE_KEY = 'snapshot-finance-swr-cache'

// localStorage 에 너무 많이 쌓이면 Quota 초과 — 키 개수 상한.
const MAX_ENTRIES = 50

// SWR Cache<Data> 의 형태와 호환되도록 any 로 둔다 — SWR 내부 State 객체를 그대로 저장.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function localStorageProvider(): Map<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map<string, any>()

    if (typeof window === 'undefined') return map

    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const entries = JSON.parse(raw) as Array<[string, any]>
            for (const [k, v] of entries) {
                map.set(k, v)
            }
        }
    } catch {
        // 파싱 실패 시 비어있는 캐시로 시작 (fail-open)
    }

    window.addEventListener('beforeunload', () => {
        try {
            const allEntries = Array.from(map.entries())
            // SWR 내부 키(_$)는 직렬화 제외 + 상한 넘으면 최근 것만 유지
            const persistable = allEntries
                .filter(([k]) => !k.startsWith('$'))
                .slice(-MAX_ENTRIES)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
        } catch {
            // Quota 초과 등 — silent fail
        }
    })

    return map
}
