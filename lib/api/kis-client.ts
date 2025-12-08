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

export class KisClient {
    private async getAccessToken(): Promise<string> {
        const now = new Date()

        // 1. Check DB for valid token
        const dbToken = await prisma.apiToken.findUnique({
            where: { provider: 'KIS' },
        })

        if (dbToken && dbToken.expiresAt > now) {
            return dbToken.token
        }

        console.log('Fetching new KIS Access Token...')

        try {
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
        } catch (error) {
            console.error('KIS Token Error:', error)
            throw error
        }
    }

    async getCurrentPrice(symbol: string, market: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI') {
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
            })

            if (!response.ok) {
                throw new Error(`KIS API Error: ${response.status}`)
            }

            const data = await response.json()
            if (data.rt_cd !== '0') {
                throw new Error(`KIS API Error: ${data.msg1}`)
            }

            return {
                price: parseInt(data.output.stck_prpr), // Current Price
                change: parseInt(data.output.prdy_vrss), // Change amount
                changeRate: parseFloat(data.output.prdy_ctrt), // Change rate
            }
        }

        // Overseas Stock (US)
        else {
            try {
                // Use Yahoo Finance for US stocks to avoid exchange code issues (NAS/NYS/AMS)
                const quote = await yahooFinance.quote(symbol)
                return {
                    price: quote.regularMarketPrice || 0,
                    change: quote.regularMarketChange || 0,
                    changeRate: quote.regularMarketChangePercent || 0,
                }
            } catch (error) {
                console.error(`Yahoo Finance Error for ${symbol}:`, error)
                // Fallback or rethrow
                throw error
            }
        }
    }

    async getDailyPrice(symbol: string, market: 'KOSPI' | 'KOSDAQ' | 'US', date: string) {
        const token = await this.getAccessToken()

        // Domestic Stock
        if (market === 'KOSPI' || market === 'KOSDAQ') {
            const path = '/uapi/domestic-stock/v1/quotations/inquire-daily-price'
            const tr_id = 'FHKST01010400'

            const params = new URLSearchParams({
                FID_COND_MRKT_DIV_CODE: 'J',
                FID_INPUT_ISCD: symbol,
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
            })

            if (!response.ok) {
                throw new Error(`KIS API Error: ${response.status}`)
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
}

export const kisClient = new KisClient()
