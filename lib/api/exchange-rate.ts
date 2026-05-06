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

const HARD_FALLBACK_KRW_PER_USD = 1400

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

export async function getUsdExchangeRate(): Promise<number> {
    const now = Date.now()

    // 1. L1: in-memory hot cache
    if (cachedRate && now - cachedRate.timestamp < CACHE_DURATION_MS) {
        return cachedRate.price
    }

    // 2. L2: Redis 공유 캐시 (cron 이 갱신해 둔 값)
    try {
        const shared = await cacheGet<ExchangeRateCacheEntry>(exchangeRateKey())
        if (shared && Number.isFinite(shared.rate) && shared.rate > 0) {
            cachedRate = { price: shared.rate, timestamp: now }
            return shared.rate
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
                cachedRate = { price: rate, timestamp: now }
                console.log(`Exchange Rate Updated: ${rate} (Source: ${source.name})`)
                // L2 채워두기 — 다른 인스턴스도 즉시 혜택
                cacheSet(
                    exchangeRateKey(),
                    { rate, updatedAt: new Date().toISOString() } satisfies ExchangeRateCacheEntry,
                    EXCHANGE_RATE_CACHE_TTL_SECONDS,
                ).catch(() => { })
                return rate
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
        return cachedRate.price
    }

    console.error(`All FX sources failed and no cache. Falling back to ${HARD_FALLBACK_KRW_PER_USD}.`)
    return HARD_FALLBACK_KRW_PER_USD
}
