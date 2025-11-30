import { prisma } from '@/lib/prisma'

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
            // Note: US stock price API requires different endpoint and logic
            // For MVP, we might need to stick with Yahoo for US or implement US specific endpoint
            // Let's implement US price check
            const path = '/uapi/overseas-price/v1/quotations/price'
            const tr_id = 'HHDFS00000300' // US Stock Price

            // Exchange code mapping
            // NAS: Nasdaq, NYS: NYSE, AMS: AMEX
            // We need to know the exchange code. For now, default to NAS or try to infer?
            // KIS requires exchange code (NAS, NYS, AMS)
            // This is a limitation. We might need to store exchange code in our DB.

            // For now, let's assume NAS for simplicity or try to handle it
            const exchange = 'NAS' // Default to Nasdaq for now

            const params = new URLSearchParams({
                AUTH: '',
                EXCD: exchange,
                SYMB: symbol,
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
                // Try NYSE if NAS fails? Or just throw
                throw new Error(`KIS US API Error: ${response.status}`)
            }

            const data = await response.json()
            if (data.rt_cd !== '0') {
                throw new Error(`KIS US API Error: ${data.msg1}`)
            }

            return {
                price: parseFloat(data.output.last), // US stocks have decimals
                change: parseFloat(data.output.diff),
                changeRate: parseFloat(data.output.rate),
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
            const path = '/uapi/overseas-price/v1/quotations/dailyprice'
            const tr_id = 'HHDFS76240000'
            const exchange = 'NAS' // Default to NAS, should be dynamic ideally

            const params = new URLSearchParams({
                AUTH: '',
                EXCD: exchange,
                SYMB: symbol,
                GUBN: '0', // Daily
                BYMD: date.replace(/-/g, ''), // Base date
                MODP: '1', // Adjusted price
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
                throw new Error(`KIS US API Error: ${response.status}`)
            }

            const data = await response.json()
            if (data.rt_cd !== '0') {
                // Try NYSE if NAS fails (simple fallback)
                if (exchange === 'NAS') {
                    // Recursive call with NYSE? Or just fail for now.
                    // For MVP, let's just log and throw.
                }
                throw new Error(`KIS US API Error: ${data.msg1}`)
            }

            // API returns list of daily prices. We need to find the specific date or the first one if BYMD works as start date.
            // KIS Overseas daily price API usually returns data *ending* at BYMD or *around* BYMD depending on endpoint.
            // HHDFS76240000 returns 100 days based on BYMD (usually up to BYMD).

            const targetDate = date.replace(/-/g, '')
            const output = data.output2.find((item: any) => item.xymd === targetDate)

            if (!output) {
                return null
            }

            return {
                date: date,
                close: parseFloat(output.clos),
                open: parseFloat(output.open),
                high: parseFloat(output.high),
                low: parseFloat(output.low),
                volume: parseInt(output.tvol),
            }
        }
    }
}

export const kisClient = new KisClient()
