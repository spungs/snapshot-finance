// 활성 포트폴리오(active_portfolio 쿠키)에 종속된 브라우저 캐시의 단일 목록.
//
// 배경: 서버측 Redis 캐시는 holdingsCacheKey(userId) 처럼 userId 로 분리돼 있지만,
// 브라우저 캐시는 전부 전역 키였다. 포트폴리오 전환은 router.refresh() 라
// 컴포넌트가 언마운트되지 않으므로 내 계좌 필터 / 내 시세 / 내 SWR 응답이
// 남의 포트폴리오 화면에 그대로 남는다.
//
// 해결 방식은 "키에 ownerId 를 붙인다" 가 아니라 "전환 시 통째로 버린다" 다.
// 전자는 컴포넌트를 새로 만들 때마다 기억해야 해서 누락이 기본값이 된다
// (실제로 performance-chart 하나만 스코프가 있었고 나머지는 전부 빠져 있었다).
//
// ⚠️ 여기에 키를 추가할 때의 기준: "값이 특정 포트폴리오의 데이터인가?"
//    - 계좌 id, 종목 시세, 서버 응답 → 포트폴리오 종속. 추가할 것.
//    - 보기 모드(holdings-view-mode), 언어, 통화, 테마 → 사람의 취향. 추가하지 말 것.

import { SWR_CACHE_STORAGE_KEY } from '@/lib/swr/persist-cache'

/** 계좌 탭 필터 — 값이 accountId 라 다른 포트폴리오에선 존재하지 않는 id 가 된다. */
export const ACCOUNT_FILTER_STORAGE_KEY = 'holdings-account-filter'

/** 일괄 등록 다이얼로그가 기억하는 마지막 계좌 — 값이 accountId. */
export const BULK_IMPORT_RECENT_ACCOUNT_KEY = 'snapshot.bulkImport.lastAccountId'

/** 홈의 직전 실시간 시세 stash — 남의 포트폴리오에 내 시세가 뜬다. (sessionStorage) */
export const HOME_TICKS_STORAGE_KEY = 'home:committed-ticks:v1'

const LOCAL_KEYS = [
    SWR_CACHE_STORAGE_KEY,
    ACCOUNT_FILTER_STORAGE_KEY,
    BULK_IMPORT_RECENT_ACCOUNT_KEY,
]

const SESSION_KEYS = [HOME_TICKS_STORAGE_KEY]

/**
 * 포트폴리오 종속 브라우저 캐시를 모두 폐기한다.
 *
 * 호출 순서가 중요하다 — 반드시 페이지를 떠나기 "전에" 호출할 것.
 * suspendSwrPersist() 로 저장을 봉인한 뒤 호출해야 pagehide 가 stale 캐시를
 * 되살리지 않는다. (portfolio-switcher 참고)
 */
export function clearPortfolioScopedCache() {
    if (typeof window === 'undefined') return

    for (const key of LOCAL_KEYS) {
        try {
            window.localStorage.removeItem(key)
        } catch {
            /* private mode / quota — 지우지 못해도 전환 자체는 진행한다 */
        }
    }

    for (const key of SESSION_KEYS) {
        try {
            window.sessionStorage.removeItem(key)
        } catch {
            /* 동일 */
        }
    }
}
