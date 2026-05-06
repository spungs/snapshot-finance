// SWR 캐시를 localStorage 에 영속화한다.
//
// 저장 트리거 (iOS PWA 안정성을 위해 다중 이벤트):
// - visibilitychange: hidden — 사용자가 탭/앱을 백그라운드로 보낼 때
// - pagehide — 페이지가 언로드되거나 bfcache 로 들어갈 때 (iOS 에서 가장 신뢰)
// - beforeunload — 데스크톱 브라우저 정상 종료
//
// iOS PWA 의 "force quit" 은 어떤 이벤트도 보장하지 않으므로 위 세 가지로
// 가능한 모든 정상 종료 경로를 커버한다.
//
// SWR 공식 문서: https://swr.vercel.app/docs/advanced/cache

const STORAGE_KEY = 'snapshot-finance-swr-cache'
const MAX_ENTRIES = 50

let saveScheduled = false

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

    const save = () => {
        try {
            const allEntries = Array.from(map.entries())
            // SWR 내부 키($) 는 제외 + 상한 넘으면 최근 것만 유지
            const persistable = allEntries
                .filter(([k]) => !k.startsWith('$'))
                .slice(-MAX_ENTRIES)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
        } catch {
            // Quota 초과 등 — silent fail
        }
    }

    // 같은 tick 에 여러 이벤트가 겹쳐도 한 번만 save (microtask 합치기)
    const scheduleSave = () => {
        if (saveScheduled) return
        saveScheduled = true
        queueMicrotask(() => {
            saveScheduled = false
            save()
        })
    }

    // 다중 이벤트 — 어느 하나라도 트리거되면 저장
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') scheduleSave()
    })
    window.addEventListener('pagehide', scheduleSave)
    window.addEventListener('beforeunload', scheduleSave)

    return map
}
