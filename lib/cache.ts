import { Redis } from '@upstash/redis'

// Upstash Redis 인스턴스 (lib/ratelimit.ts와 동일 환경변수 재사용)
// fail-open 정책: Redis 장애 시 캐시 미스로 처리하고 원본 로직 실행.
//
// 환경변수 미설정 시 (대표적으로 .env.development.local 로컬 dev) 아예 비활성화 —
// undefined token 으로 fetch 시도해 'TypeError: fetch failed' 가 SSR 로그를
// 도배하는 것을 막는다. 운영에서는 두 변수 모두 세팅되어 정상 작동.
const cacheEnabled =
    !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

const redis = cacheEnabled
    ? new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      })
    : null

if (!cacheEnabled && process.env.NODE_ENV !== 'production') {
    console.info(
        '[Cache] Upstash Redis disabled (UPSTASH_REDIS_REST_URL / TOKEN not set). Operating without cache.',
    )
}

/**
 * Redis 캐시 조회. Redis 장애/타임아웃 시 null 반환 (fail-open).
 * Upstash SDK는 자동으로 JSON 직렬화/역직렬화 수행.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
    if (!redis) return null
    try {
        const value = await redis.get<T>(key)
        return value
    } catch (error) {
        console.warn(`[Cache] GET failed for ${key}:`, error)
        return null
    }
}

/**
 * Redis 캐시 저장. ttlSeconds 후 자동 만료.
 * 실패해도 원본 로직 진행에 영향을 주지 않도록 swallow.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!redis) return
    try {
        await redis.set(key, value, { ex: ttlSeconds })
    } catch (error) {
        console.warn(`[Cache] SET failed for ${key}:`, error)
    }
}

/**
 * 캐시 삭제. mutate 시 invalidate 용도.
 */
export async function cacheDelete(key: string): Promise<void> {
    if (!redis) return
    try {
        await redis.del(key)
    } catch (error) {
        console.warn(`[Cache] DEL failed for ${key}:`, error)
    }
}

// ---------------------------------------------------------------------------
// 도메인 공용 캐시 키 — cron(/api/cron/update-prices)이 주기적으로 갱신하고
// holdingService / kis-client 가 우선 조회하는 공유 캐시. 키를 한곳에서
// 정의해 cron-writer 와 reader 가 절대로 어긋나지 않도록 한다.
// ---------------------------------------------------------------------------

export interface PriceCacheEntry {
    price: number
    currency: string
    change: number
    changeRate: number
    updatedAt: string
}

export interface ExchangeRateCacheEntry {
    rate: number
    updatedAt: string
}

// 가격 TTL 길게: 장외 시간/주말엔 cron 이 안 돌아도 마지막 종가가 살아있어야 함.
// 장중엔 cron(3분)이 매번 덮어쓰므로 stale 위험 없음. 종목별 가격 변동 없는 장외엔
// 캐시 자체가 곧 fresh 한 가격(=종가)이라 길게 유지해도 OK.
export const PRICE_CACHE_TTL_SECONDS = 14400 // 4시간
export const EXCHANGE_RATE_CACHE_TTL_SECONDS = 21600 // 6시간 — 환율 변동 작음

export const stockPriceKey = (stockCode: string) => `stock:price:${stockCode}`
export const exchangeRateKey = () => `exchange:usd-krw`
