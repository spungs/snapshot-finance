import { Redis } from '@upstash/redis'

// Upstash Redis 인스턴스 (lib/ratelimit.ts와 동일 환경변수 재사용)
// fail-open 정책: Redis 장애 시 캐시 미스로 처리하고 원본 로직 실행
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * Redis 캐시 조회. Redis 장애/타임아웃 시 null 반환 (fail-open).
 * Upstash SDK는 자동으로 JSON 직렬화/역직렬화 수행.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
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

export const PRICE_CACHE_TTL_SECONDS = 600 // 10분 — cron 주기(3분)의 3배 정도 여유
export const EXCHANGE_RATE_CACHE_TTL_SECONDS = 600

export const stockPriceKey = (stockCode: string) => `stock:price:${stockCode}`
export const exchangeRateKey = () => `exchange:usd-krw`
