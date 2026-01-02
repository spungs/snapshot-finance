import YahooFinance from 'yahoo-finance2'
import { kisClient } from '@/lib/api/kis-client'

const yahooFinance = new YahooFinance()

// 캐시를 위한 간단한 인메모리 저장소
let cachedRate: { price: number; timestamp: number } | null = null
const CACHE_DURATION = 1000 * 60 * 5 // 5분

export async function getUsdExchangeRate(): Promise<number> {
    const now = Date.now()

    // 1. Check Cache
    if (cachedRate && (now - cachedRate.timestamp < CACHE_DURATION)) {
        return cachedRate.price
    }

    let rate = 0
    let source = ''

    // 2. Try Yahoo Finance
    try {
        const result = await yahooFinance.quote('KRW=X') as any
        if (result.regularMarketPrice) {
            rate = result.regularMarketPrice
            source = 'Yahoo'
        }
    } catch (e) {
        console.warn('Yahoo FX failed, trying KIS...', e instanceof Error ? e.message : e)
    }

    // 3. Try KIS API -> Skipped (No dedicated public FX API, embedded ones are unstable)
    // if (rate === 0) { ... }

    // 4. Try Finnhub (if KIS failed)
    // 3. Finnhub (Quote API is more reliably free than Forex API)
    if (rate === 0) {
        try {
            const apiKey = process.env.FINNHUB_API_KEY
            if (apiKey) {
                // Try getting quote for USD/KRW pair
                // Symbol format might vary, 'OANDA:USD_KRW' is common for Finnhub
                const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:USD_KRW&token=${apiKey}`, { cache: 'no-store' })
                if (response.ok) {
                    const data = await response.json()
                    // c: Current price
                    if (data.c) {
                        rate = Number(data.c)
                        source = 'Finnhub (Quote)'
                    }
                }
            }
        } catch (e) {
            console.warn('Finnhub Quote FX failed:', e)
        }
    }

    // 4. Open Exchange Rates (Free, Public, No Key required - Ultimate Fallback)
    if (rate === 0) {
        try {
            const response = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
            if (response.ok) {
                const data = await response.json()
                if (data.rates && data.rates.KRW) {
                    rate = data.rates.KRW
                    source = 'OpenEras'
                }
            }
        } catch (e) {
            console.warn('Open API FX failed:', e)
        }
    }

    // 5. Final Fallback or Cache
    if (rate === 0) {
        if (cachedRate) {
            console.warn('All FX sources failed, using stale cache.')
            return cachedRate.price
        }
        console.error('All FX sources failed, using hardcoded fallback.')
        return 1400 // Hard fallback
    }

    // Success - Update Cache
    cachedRate = {
        price: rate,
        timestamp: now
    }
    console.log(`Exchange Rate Updated: ${rate} (Source: ${source})`)

    return rate
}
