// USD → KRW exchange rate fetcher.
//
// Fallback chain:
//   1. Open Exchange Rates (open.er-api.com)        — free, no key, market rate
//   2. fawazahmed0/currency-api (jsDelivr CDN)       — free, no key, daily, very stable CDN
//   3. Finnhub (OANDA:USD_KRW)                       — free tier, requires FINNHUB_API_KEY
//
// Yahoo Finance is intentionally NOT used: it relies on cookie/crumb scraping
// and frequently returns 429 Too Many Requests, which previously cost ~2.5s
// per cold cache miss while the fallback chain unwound. KIS does not expose a
// reliable public FX endpoint either, so it's omitted as well.
//
// 캐시 계층:
//   L1: in-memory (per Lambda 인스턴스, 5분)  — 가장 빠름
//   L2: Redis (모든 인스턴스 공유, 10분)        — cron 이 주기적으로 갱신
//   L3: 위 sources

import {
    cacheGet,
    cacheSet,
    exchangeRateKey,
    EXCHANGE_RATE_CACHE_TTL_SECONDS,
    type ExchangeRateCacheEntry,
} from '@/lib/cache'

const CACHE_DURATION_MS = 1000 * 60 * 5 // 5 minutes (in-memory L1)
let cachedRate: { price: number; timestamp: number } | null = null

/**
 * USD→KRW 환율의 단일 폴백 상수.
 * - 모든 외부 소스 실패 시 마지막 보루
 * - UI/SSR 에서 환율 데이터 누락 시 표시 기본값
 * 코드 곳곳에 1400/1435 매직넘버 산재 → 통일하여 한 곳에서만 관리.
 */
export const FALLBACK_USD_RATE = 1435

type RateSource = (signal?: AbortSignal) => Promise<number | null>

const fromOpenExchangeRates: RateSource = async (signal) => {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store', signal })
    if (!res.ok) return null
    const data = await res.json()
    const rate = data?.rates?.KRW
    return typeof rate === 'number' && rate > 0 ? rate : null
}

const fromFawazahmedCdn: RateSource = async (signal) => {
    // Primary CDN — falls back to GitHub Pages if jsDelivr is rate-limited
    const urls = [
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
        'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
    ]
    for (const url of urls) {
        try {
            const res = await fetch(url, { cache: 'no-store', signal })
            if (!res.ok) continue
            const data = await res.json()
            const rate = data?.usd?.krw
            if (typeof rate === 'number' && rate > 0) return rate
        } catch {
            // Try next mirror
        }
    }
    return null
}

const fromFinnhubOanda: RateSource = async (signal) => {
    const apiKey = process.env.FINNHUB_API_KEY
    if (!apiKey) return null
    const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=OANDA:USD_KRW&token=${apiKey}`,
        { cache: 'no-store', signal },
    )
    if (!res.ok) return null
    const data = await res.json()
    const rate = Number(data?.c)
    return rate > 0 ? rate : null
}

const SOURCES: Array<{ name: string; fn: RateSource }> = [
    { name: 'OpenExchangeRates', fn: fromOpenExchangeRates },
    { name: 'fawazahmed0-CDN', fn: fromFawazahmedCdn },
    { name: 'Finnhub-OANDA', fn: fromFinnhubOanda },
]

/**
 * 환율 + 갱신 시각을 함께 반환. UI 푸터에 "방금 갱신" 같은 신뢰 시그널을 표시할 때 사용.
 * 모든 캐시 계층의 동작은 getUsdExchangeRate 와 동일.
 */
export async function getUsdExchangeRateWithMeta(): Promise<{ rate: number; updatedAt: string | null }> {
    const now = Date.now()

    // 1. L1: in-memory hot cache
    if (cachedRate && now - cachedRate.timestamp < CACHE_DURATION_MS) {
        return { rate: cachedRate.price, updatedAt: new Date(cachedRate.timestamp).toISOString() }
    }

    // 2. L2: Redis 공유 캐시 (cron 이 갱신해 둔 값)
    try {
        const shared = await cacheGet<ExchangeRateCacheEntry>(exchangeRateKey())
        if (shared && Number.isFinite(shared.rate) && shared.rate > 0) {
            cachedRate = { price: shared.rate, timestamp: now }
            return { rate: shared.rate, updatedAt: shared.updatedAt ?? null }
        }
    } catch {
        // fail-open: Redis 장애 시 sources 로 진행
    }

    // 3. L3: Try each source in order with a per-source timeout so a hung endpoint
    //    can't sink the entire request.
    for (const source of SOURCES) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 1500)
        try {
            const rate = await source.fn(controller.signal)
            if (rate !== null) {
                const updatedAt = new Date().toISOString()
                cachedRate = { price: rate, timestamp: now }
                console.log(`Exchange Rate Updated: ${rate} (Source: ${source.name})`)
                // L2 채워두기 — 다른 인스턴스도 즉시 혜택
                cacheSet(
                    exchangeRateKey(),
                    { rate, updatedAt } satisfies ExchangeRateCacheEntry,
                    EXCHANGE_RATE_CACHE_TTL_SECONDS,
                ).catch(() => { })
                return { rate, updatedAt }
            }
        } catch (e) {
            console.warn(`FX source ${source.name} failed:`, e instanceof Error ? e.message : e)
        } finally {
            clearTimeout(timer)
        }
    }

    // 4. Stale cache wins over hard fallback
    if (cachedRate) {
        console.warn('All FX sources failed, using stale cache.')
        return { rate: cachedRate.price, updatedAt: new Date(cachedRate.timestamp).toISOString() }
    }

    console.error(`All FX sources failed and no cache. Falling back to ${FALLBACK_USD_RATE}.`)
    return { rate: FALLBACK_USD_RATE, updatedAt: null }
}

export async function getUsdExchangeRate(): Promise<number> {
    const { rate } = await getUsdExchangeRateWithMeta()
    return rate
}

/**
 * 과거 날짜 환율 소스. 앞에서부터 시도하고 첫 성공을 쓴다.
 *
 * fawazahmed0 는 **2024-03-06 이전 데이터가 없어** 404 를 낸다(검증: 03-06 200 / 03-01 404).
 * 그래서 ECB 기반 frankfurter 를 뒤에 둔다 — 1999년까지 커버하고 키도 필요 없다.
 * 단 ECB 는 영업일만 있어 주말·공휴일을 요청하면 직전 영업일 값을 돌려준다
 * (예: 2021-01-02 토 → 2020-12-31 값). 그 날의 기록으로는 이게 최선이라 그대로 쓴다.
 */
const HISTORICAL_SOURCES: Array<{
    name: string
    url: (date: string) => string
    parse: (data: unknown) => number | null
}> = [
    {
        name: 'fawazahmed0-jsdelivr',
        url: (d) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${d}/v1/currencies/usd.json`,
        parse: (data) => {
            const rate = (data as { usd?: { krw?: unknown } })?.usd?.krw
            return typeof rate === 'number' && rate > 0 ? rate : null
        },
    },
    {
        name: 'fawazahmed0-mirror',
        url: (d) => `https://${d}.currency-api.pages.dev/v1/currencies/usd.json`,
        parse: (data) => {
            const rate = (data as { usd?: { krw?: unknown } })?.usd?.krw
            return typeof rate === 'number' && rate > 0 ? rate : null
        },
    },
    {
        name: 'frankfurter-ecb',
        url: (d) => `https://api.frankfurter.dev/v1/${d}?base=USD&symbols=KRW`,
        parse: (data) => {
            const rate = (data as { rates?: { KRW?: unknown } })?.rates?.KRW
            return typeof rate === 'number' && rate > 0 ? rate : null
        },
    },
]

/**
 * 특정 과거 날짜(YYYY-MM-DD)의 USD→KRW 환율.
 *
 * 과거 스냅샷 작성 시 "그 날의 환율"이 필요하다. 기존에는 클라이언트가
 * `/api/stocks/history?symbol=KRW=X&market=FX` 로 조회했지만, kis-client 의 US 분기가
 * Yahoo → KIS 해외시세로 교체되면서 KIS 에 없는 `KRW=X` 는 항상 null 을 반환했고,
 * 결과적으로 모든 과거 스냅샷이 FALLBACK_USD_RATE 로 굳어졌다.
 *
 * 조회 실패 시 null — 호출부가 "당시 환율 확인 불가"를 사용자에게 알릴 수 있게 한다.
 */
export async function getUsdExchangeRateOn(date: string): Promise<number | null> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

    const cacheKey = exchangeRateKey(date)
    try {
        const cached = await cacheGet<ExchangeRateCacheEntry>(cacheKey)
        if (cached && Number.isFinite(cached.rate) && cached.rate > 0) return cached.rate
    } catch {
        // fail-open
    }

    for (const source of HISTORICAL_SOURCES) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 4000)
        try {
            const res = await fetch(source.url(date), { cache: 'no-store', signal: controller.signal })
            if (!res.ok) continue
            const rate = source.parse(await res.json())
            if (rate !== null) {
                // 과거 환율은 변하지 않으므로 길게 캐시한다.
                cacheSet(
                    cacheKey,
                    { rate, updatedAt: date } satisfies ExchangeRateCacheEntry,
                    60 * 60 * 24 * 30,
                ).catch(() => { })
                return rate
            }
        } catch (e) {
            console.warn(`Historical FX source ${source.name} failed for ${date}:`, e instanceof Error ? e.message : e)
        } finally {
            clearTimeout(timer)
        }
    }

    console.warn(`All historical FX sources failed for ${date}.`)
    return null
}
