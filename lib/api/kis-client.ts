import { prisma } from '@/lib/prisma'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

const KIS_BASE_URL = {
    REAL: 'https://openapi.koreainvestment.com:9443',
    VIRTUAL: 'https://openapivts.koreainvestment.com:29443',
}

const APP_KEY = process.env.KIS_APP_KEY
const APP_SECRET = process.env.KIS_APP_SECRET
const CANO = process.env.KIS_CANO
const ACNT_PRDT_CD = process.env.KIS_ACNT_PRDT_CD
const MODE = (process.env.KIS_MODE as 'REAL' | 'VIRTUAL') || 'REAL'
const BASE_URL = KIS_BASE_URL[MODE]

interface AccessToken {
    access_token: string
    token_type: string
    expires_in: number
    expires_at: number // Timestamp in ms
}

// Simple in-memory cache for token (Note: This resets on server restart. For production, use DB or Redis)
let cachedToken: AccessToken | null = null

// Price Cache to prevent 429 Rate Limits
interface PriceCacheItem {
    price: number
    change: number
    changeRate: number
    timestamp: number
}
const priceCache: Map<string, PriceCacheItem> = new Map()
const PRICE_CACHE_DURATION = 1000 * 60 * 2 // 2 minutes

export class KisClient {
    private tokenPromise: Promise<string> | null = null

    public async ensureConnection() {
        try {
            await this.getAccessToken()
        } catch (error) {
            console.error('Failed to ensure KIS connection:', error)
        }
    }

    private async getAccessToken(): Promise<string> {
        // If a request is already in progress, return that promise
        if (this.tokenPromise) {
            return this.tokenPromise
        }

        this.tokenPromise = (async () => {
            try {
                const now = new Date()

                // 1. Check DB for valid token
                const dbToken = await prisma.apiToken.findUnique({
                    where: { provider: 'KIS' },
                })

                if (dbToken && dbToken.expiresAt > now) {
                    return dbToken.token
                }

                console.log('Fetching new KIS Access Token...')

                const response = await fetch(`${BASE_URL}/oauth2/tokenP`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        grant_type: 'client_credentials',
                        appkey: APP_KEY,
                        appsecret: APP_SECRET,
                    }),
                    cache: 'no-store', // Token requests should always be fresh
                })

                if (!response.ok) {
                    const errorText = await response.text()
                    throw new Error(`Failed to get token: ${response.status} ${errorText}`)
                }

                const data = await response.json()

                // Calculate expiration (give 1 minute buffer)
                const expiresAt = new Date(now.getTime() + (data.expires_in - 60) * 1000)

                // 2. Save to DB
                await prisma.apiToken.upsert({
                    where: { provider: 'KIS' },
                    update: {
                        token: data.access_token,
                        expiresAt: expiresAt,
                    },
                    create: {
                        provider: 'KIS',
                        token: data.access_token,
                        expiresAt: expiresAt,
                    },
                })

                return data.access_token
            } finally {
                // Reset the promise so subsequent calls can retry if failed, or check expiry again
                this.tokenPromise = null
            }
        })()

        return this.tokenPromise
    }

    async getCurrentPrice(symbol: string, market: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI', retryCount = 0): Promise<{ price: number; change: number; changeRate: number }> {
        // 1. Check Cache
        const cacheKey = `${market}:${symbol}`
        const cached = priceCache.get(cacheKey)
        if (cached && (Date.now() - cached.timestamp < PRICE_CACHE_DURATION)) {
            // console.log(`[Cache] Hit for ${symbol}`)
            return {
                price: cached.price,
                change: cached.change,
                changeRate: cached.changeRate
            }
        }

        const token = await this.getAccessToken()

        // Domestic Stock (KOSPI/KOSDAQ)
        if (market === 'KOSPI' || market === 'KOSDAQ') {
            const path = '/uapi/domestic-stock/v1/quotations/inquire-price'
            const tr_id = 'FHKST01010100'

            const params = new URLSearchParams({
                FID_COND_MRKT_DIV_CODE: 'J', // J: Stock
                FID_INPUT_ISCD: symbol.split('.')[0], // Stock Code (remove .KS/.KQ suffix)
            })

            const response = await fetch(`${BASE_URL}${path}?${params}`, {
                headers: {
                    'Content-Type': 'application/json',
                    authorization: `Bearer ${token}`,
                    appkey: APP_KEY!,
                    appsecret: APP_SECRET!,
                    tr_id: tr_id,
                },
                cache: 'no-store', // Real-time price must not be cached
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('KIS API Error Response:', errorText)

                // Check if token is expired
                if (errorText.includes('기간이 만료된 token') || errorText.includes('EGW00123')) {
                    if (retryCount < 1) {
                        console.log('Token expired, refreshing and retrying...')
                        // Delete expired token from DB
                        await prisma.apiToken.deleteMany({
                            where: { provider: 'KIS' }
                        })
                        // Retry with new token
                        return this.getCurrentPrice(symbol, market, retryCount + 1)
                    }
                }

                throw new Error(`KIS API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()
            if (data.rt_cd !== '0') {
                throw new Error(`KIS API Error: ${data.msg1}`)
            }

            const result = {
                price: parseInt(data.output.stck_prpr), // Current Price
                change: parseInt(data.output.prdy_vrss), // Change amount
                changeRate: parseFloat(data.output.prdy_ctrt), // Change rate
            }
            priceCache.set(cacheKey, { ...result, timestamp: Date.now() })
            return result
        }

        // Overseas Stock (US)
        else {
            try {
                // Use Finnhub for US stocks (More stable than Yahoo Finance)
                // Docs: https://finnhub.io/docs/api/quote
                const apiKey = process.env.FINNHUB_API_KEY
                if (!apiKey) {
                    throw new Error('FINNHUB_API_KEY is missing in .env')
                }

                const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`, {
                    cache: 'no-store'
                })

                if (!response.ok) {
                    throw new Error(`Finnhub API error: ${response.status}`)
                }

                const data = await response.json()
                // Response format: { c: Current price, d: Change, dp: Percent change, h: High, l: Low, o: Open, pc: Previous close }

                // Check if data is valid (sometimes Finnhub returns 0 for invalid symbols)
                if (data.c === 0 && data.pc === 0) {
                    throw new Error(`No data found for ${symbol}`)
                }

                const price = Number(data.c)
                const change = Number(data.d) // Finnhub provides absolute change
                const changeRate = Number(data.dp) // Finnhub provides percentage

                const result = {
                    price,
                    change,
                    changeRate,
                }
                priceCache.set(cacheKey, { ...result, timestamp: Date.now() })
                return result

            } catch (error) {
                // Enhance error message for logging
                const msg = error instanceof Error ? error.message : String(error)
                console.error(`Finnhub Error for ${symbol}:`, msg)
                throw new Error(`Finnhub failed for ${symbol}: ${msg}`)
            }
        }
    }

    async getDailyPrice(symbol: string, market: 'KOSPI' | 'KOSDAQ' | 'US', date: string, retryCount = 0): Promise<any> {
        const token = await this.getAccessToken()

        // Domestic Stock
        if (market === 'KOSPI' || market === 'KOSDAQ') {
            const cleanSymbol = symbol.split('.')[0]
            const path = '/uapi/domestic-stock/v1/quotations/inquire-daily-price'
            const tr_id = 'FHKST01010400'

            const params = new URLSearchParams({
                FID_COND_MRKT_DIV_CODE: 'J',
                FID_INPUT_ISCD: cleanSymbol,
                FID_PERIOD_DIV_CODE: 'D', // Daily
                FID_ORG_ADJ_PRC: '1', // Adjusted price
            })

            const response = await fetch(`${BASE_URL}${path}?${params}`, {
                headers: {
                    'Content-Type': 'application/json',
                    authorization: `Bearer ${token}`,
                    appkey: APP_KEY!,
                    appsecret: APP_SECRET!,
                    tr_id: tr_id,
                },
                cache: 'no-store', // Daily price should be fresh just in case
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('KIS API Daily Price Error Response:', errorText)

                // Check if token is expired
                if (errorText.includes('기간이 만료된 token') || errorText.includes('EGW00123')) {
                    if (retryCount < 1) {
                        console.log('Token expired, refreshing and retrying...')
                        // Delete expired token from DB
                        await prisma.apiToken.deleteMany({
                            where: { provider: 'KIS' }
                        })
                        // Retry with new token
                        return this.getDailyPrice(symbol, market, date, retryCount + 1)
                    }
                }

                throw new Error(`KIS API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()
            if (data.rt_cd !== '0') {
                throw new Error(`KIS API Error: ${data.msg1}`)
            }

            // Find specific date
            // Date format in API: YYYYMMDD
            const targetDate = date.replace(/-/g, '')
            const output = data.output.find((item: any) => item.stck_bsop_date === targetDate)

            if (!output) {
                return null
            }

            return {
                date: date,
                close: parseInt(output.stck_clpr),
                open: parseInt(output.stck_oprc),
                high: parseInt(output.stck_hgpr),
                low: parseInt(output.stck_lwpr),
                volume: parseInt(output.acml_vol),
            }
        }

        // Overseas Stock (US)
        else {
            try {
                // Fetch historical data from Yahoo Finance
                // period1: start date, period2: end date (exclusive)
                // We add a small buffer to ensure we cover the target date in different timezones
                const startDate = new Date(date)
                const endDate = new Date(startDate.getTime() + 86400000 * 2) // +2 days

                const result = await yahooFinance.historical(symbol, {
                    period1: date,
                    period2: endDate.toISOString().split('T')[0],
                    interval: '1d',
                })

                // Find the specific date
                // Yahoo Finance returns dates as Date objects with time set to 00:00:00 UTC (usually)
                // We compare YYYY-MM-DD string
                const quote = result.find((item) => {
                    const itemDate = item.date.toISOString().split('T')[0]
                    return itemDate === date
                })

                if (!quote) {
                    return null
                }

                return {
                    date: date,
                    close: quote.adjClose || quote.close,
                    open: quote.open,
                    high: quote.high,
                    low: quote.low,
                    volume: quote.volume,
                }
            } catch (error) {
                console.error(`Yahoo Finance Daily Price Error for ${symbol}:`, error)
                return null
            }
        }
    }

    async getDailyPriceRange(symbol: string, market: 'KOSPI' | 'KOSDAQ' | 'US', startDate: string, endDate: string): Promise<any[]> {
        try {
            // For historical chart data, we use Yahoo Finance for all markets.
            // Yahoo Finance handles long ranges and Korean stocks well if suffixes are correct.

            let yahooSymbol = symbol
            if (market === 'KOSPI' && !yahooSymbol.endsWith('.KS')) {
                yahooSymbol = `${yahooSymbol.split('.')[0]}.KS`
            } else if (market === 'KOSDAQ' && !yahooSymbol.endsWith('.KQ')) {
                yahooSymbol = `${yahooSymbol.split('.')[0]}.KQ`
            }

            // For Yahoo Finance, period2 is exclusive, so we add 1 day to include endDate
            const end = new Date(endDate)
            end.setDate(end.getDate() + 1)
            const period2 = end.toISOString().split('T')[0]

            const result = await yahooFinance.historical(yahooSymbol, {
                period1: startDate,
                period2: period2,
                interval: '1d',
            })

            return result.map((item) => ({
                date: item.date.toISOString().split('T')[0],
                // User Feedback: Use raw close price instead of adjusted close to match Naver Finance/MTS history.
                // 2021-01-08 Samsung Electronics: Close 88,800 vs Adj Close 80,270
                close: item.close || item.adjClose,
                open: item.open,
                high: item.high,
                low: item.low,
                volume: item.volume,
            }))
        } catch (error) {
            console.error(`History Fetch Error for ${symbol}:`, error)
            return []
        }
    }

    async getExchangeRate(): Promise<number> {
        // Priority 2: KIS API (Specific FX requires checking balance or orderable amount to get applied rate)
        // However, KIS doesn't have a simple public "Get USD/KRW" endpoint without account context usually.
        // We will try to use the "Inquire Market Price" for a dollar ETF? No.
        // Let's use the "Inquire Present Balance" for overseas stock which includes exchange rate (rprs_mrkt_rt).
        // OR simpler: just use Finnhub as the valid backup if KIS is too complex for just FX.
        // User requested: Yahoo -> KIS -> Finnhub.
        // Let's implement KIS via "Inquire Executable Amount" (TTTS3031R) which returns `exch_rate`.

        try {
            const token = await this.getAccessToken()
            // Inquire Price for US Stock Purchase Availability usually gives the provisional exchange rate
            const path = '/uapi/overseas-stock/v1/trading/inquire-psamount'
            const tr_id = MODE === 'REAL' ? 'TTTS3031R' : 'VTTT3012R' // Check docs for Virtual

            const params = new URLSearchParams({
                CANO: CANO!,
                ACNT_PRDT_CD: ACNT_PRDT_CD!,
                OVRS_EXCG_CD: 'NAS', // Nasdaq
                OVRS_ORD_UNPR: '0',
                ITEM_CD: 'AAPL' // Dummy
            })

            const response = await fetch(`${BASE_URL}${path}?${params}`, {
                headers: {
                    'Content-Type': 'application/json',
                    authorization: `Bearer ${token}`,
                    appkey: APP_KEY!,
                    appsecret: APP_SECRET!,
                    tr_id: tr_id,
                },
                cache: 'no-store'
            })

            if (!response.ok) {
                // KIS might fail if outside trading hours or maintenance.
                throw new Error(`KIS FX fetch failed status: ${response.status}`)
            }

            const data = await response.json()
            // output: { exrt: "1234.50", ... }
            if (data.output && data.output.exrt) {
                return parseFloat(data.output.exrt)
            }

            throw new Error('KIS FX data structure mismatch')

        } catch (error) {
            console.warn('KIS Exchange Rate API failed:', error)
            throw error // Propagate to let caller try Finnhub
        }
    }
}

export const kisClient = new KisClient()
