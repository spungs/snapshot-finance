'use client'

// Service Worker 의 `pages` 캐시를 명시적으로 비운다.
// CUD 변이 직후 router.refresh() 직전에 호출하면, SW StaleWhileRevalidate
// 가 stale HTML 을 반환하지 않고 강제로 네트워크에서 fresh 응답을 받게 된다.
//
// 사용 패턴:
//   const result = await someMutation()
//   if (result.success) {
//     await invalidateSwPagesCache()
//     router.refresh()
//   }
//
// SW 가 등록되지 않았거나 Cache API 가 없는 환경에서도 throw 안 하고 무시 (fail-open).

const CACHE_NAMES = ['pages']

export async function invalidateSwPagesCache(): Promise<void> {
    if (typeof window === 'undefined') return
    if (!('caches' in window)) return

    try {
        await Promise.all(
            CACHE_NAMES.map(async (name) => {
                const cache = await caches.open(name)
                const keys = await cache.keys()
                await Promise.all(keys.map((req) => cache.delete(req)))
            })
        )
    } catch (e) {
        console.warn('[SW] pages cache invalidation failed:', e)
    }
}
