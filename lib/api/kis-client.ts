import { prisma } from '@/lib/prisma'
import {
    cacheGet,
    cacheSet,
    stockPriceKey,
    PRICE_CACHE_TTL_SECONDS,
    type PriceCacheEntry,
} from '@/lib/cache'

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

// 외부 API(KIS/Finnhub) fetch 타임아웃 — 서버가 응답을 매달면(hang) 함수가 무한
// 대기하며 cron maxDuration / 게이트웨이 한도까지 점유하는 것을 방지한다.
const EXT_FETCH_TIMEOUT_MS = 5000
function fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs = EXT_FETCH_TIMEOUT_MS,
): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

interface AccessToken {
    access_token: string
    token_type: string
    expires_in: number
    expires_at: number // Timestamp in ms
}

// Simple in-memory cache for token (Note: This resets on server restart. For production, use DB or Redis)
let cachedToken: AccessToken | null = null

// Price Cache: lib/cache.ts 의 공용 stock:price:{stockCode} 키를 사용한다.
// cron(/api/cron/update-prices) 이 같은 키를 주기적으로 갱신하므로
// 캐시 hit 시 사용자 요청에서 KIS 호출이 발생하지 않는다.

// 미국 거래소 코드 매핑 — Stock.market 값(혼재) → KIS EXCD.
// 'NASD'/'NYSE'/'AMEX' 가 들어있으면 직접 매핑. 'US' 만 있는 종목은
// KisStockMaster 를 조회해 추론, 그래도 없으면 NAS 폴백.
async function resolveUsExcd(stockCode: string, market?: string | null): Promise<'NAS' | 'NYS' | 'AMS'> {
    switch (market) {
        case 'NASD':
        case 'NAS':
            return 'NAS'
        case 'NYSE':
        case 'NYS':
            return 'NYS'
        case 'AMEX':
        case 'AMS':
            return 'AMS'
    }
    try {
        const master = await prisma.stock.findUnique({
            where: { stockCode },
            select: { market: true },
        })
        if (master?.market === 'NYSE') return 'NYS'
        if (master?.market === 'AMEX') return 'AMS'
        if (master?.market === 'NASD') return 'NAS'
    } catch (e) {
        console.warn(`[KIS] resolveUsExcd lookup failed for ${stockCode}:`, e)
    }
    return 'NAS' // 가장 흔한 거래소를 기본값으로
}

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

                const response = await fetchWithTimeout(`${BASE_URL}/oauth2/tokenP`, {
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

    // bypassCache: cron 전용 옵션. true 로 넘기면 Redis 캐시를 읽지 않고
    // 항상 외부 API(Finnhub/KIS)를 호출한다.
    // ─ cron 이 같은 키를 읽어 캐시 히트 → TTL만 갱신하고 실제 API 미호출하는
    //   "캐시 고착" 문제를 방지. 사용자 요청 경로(holdingService)는 false(기본).
    async getCurrentPrice(symbol: string, market: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI', retryCount = 0, bypassCache = false): Promise<{ price: number; change: number; changeRate: number }> {
        // 1. Check Redis Cache (cron 이 갱신해 두는 공용 키)
        //    bypassCache=true(cron 호출)면 스킵 — 반드시 API 를 직접 호출해 최신 changeRate 확보.
        const cacheKey = stockPriceKey(symbol)
        if (!bypassCache) {
            const cached = await cacheGet<PriceCacheEntry>(cacheKey)
            if (cached && Number.isFinite(cached.price) && cached.price > 0) {
                return {
                    price: cached.price,
                    change: cached.change,
                    changeRate: cached.changeRate,
                }
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

            const response = await fetchWithTimeout(`${BASE_URL}${path}?${params}`, {
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

                // 초당 호출 한도 초과 → 점증 backoff 후 재시도
                if (errorText.includes('EGW00201') && retryCount < 3) {
                    await new Promise(r => setTimeout(r, 400 + retryCount * 400))
                    return this.getCurrentPrice(symbol, market, retryCount + 1)
                }

                throw new Error(`KIS API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()
            if (data.rt_cd !== '0') {
                if (String(data.msg_cd ?? '').includes('EGW00201') && retryCount < 3) {
                    await new Promise(r => setTimeout(r, 400 + retryCount * 400))
                    return this.getCurrentPrice(symbol, market, retryCount + 1)
                }
                throw new Error(`KIS API Error: ${data.msg1}`)
            }

            const result = {
                price: parseInt(data.output.stck_prpr), // Current Price
                change: parseInt(data.output.prdy_vrss), // Change amount
                changeRate: parseFloat(data.output.prdy_ctrt), // Change rate
            }
            const entry: PriceCacheEntry = {
                ...result,
                currency: 'KRW',
                updatedAt: new Date().toISOString(),
            }
            await cacheSet(cacheKey, entry, PRICE_CACHE_TTL_SECONDS)
            return result
        }

        // Overseas Stock (US)
        // 1차: Finnhub (실시간) → 실패 시 2차: KIS 해외 현재가 (15분 지연)
        else {
            const result = await this.getUsPrice(symbol)
            const entry: PriceCacheEntry = {
                ...result,
                currency: 'USD',
                updatedAt: new Date().toISOString(),
            }
            await cacheSet(cacheKey, entry, PRICE_CACHE_TTL_SECONDS)
            return result
        }
    }

    // 미국주식 현재가 — Finnhub 우선, 실패 시 KIS 해외시세 폴백.
    // Finnhub 무료 한도 초과/장애 시 cron 워밍이 끊기지 않도록 이중화.
    private async getUsPrice(symbol: string): Promise<{ price: number; change: number; changeRate: number }> {
        const finnhubKey = process.env.FINNHUB_API_KEY
        if (finnhubKey) {
            try {
                const response = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubKey}`, {
                    cache: 'no-store',
                })
                if (response.ok) {
                    const data = await response.json()
                    // c=0 && pc=0 이면 invalid symbol 응답
                    if (!(data.c === 0 && data.pc === 0)) {
                        return {
                            price: Number(data.c),
                            change: Number(data.d),
                            changeRate: Number(data.dp),
                        }
                    }
                    console.warn(`[Finnhub] No data for ${symbol}, falling back to KIS`)
                } else {
                    console.warn(`[Finnhub] HTTP ${response.status} for ${symbol}, falling back to KIS`)
                }
            } catch (e) {
                console.warn(`[Finnhub] Error for ${symbol}, falling back to KIS:`, e)
            }
        } else {
            console.warn('[Finnhub] FINNHUB_API_KEY missing, using KIS only')
        }

        return this.getKisOverseasPrice(symbol)
    }

    // KIS 해외 현재가 단일 조회 (HHDFS00000300, 15분 지연 시세).
    // 실시간 시세는 별도 신청 필요.
    // EGW00201("초당 거래건수 초과")는 일시적 rate limit 이므로 짧은 backoff 후 재시도한다.
    private async getKisOverseasPrice(symbol: string, retryCount = 0): Promise<{ price: number; change: number; changeRate: number }> {
        const token = await this.getAccessToken()
        const excd = await resolveUsExcd(symbol)

        const path = '/uapi/overseas-price/v1/quotations/price'
        const tr_id = 'HHDFS00000300'
        const params = new URLSearchParams({
            AUTH: '',
            EXCD: excd,
            SYMB: symbol,
        })

        const response = await fetchWithTimeout(`${BASE_URL}${path}?${params}`, {
            headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${token}`,
                appkey: APP_KEY!,
                appsecret: APP_SECRET!,
                tr_id: tr_id,
                custtype: 'P',
            },
            cache: 'no-store',
        })

        if (!response.ok) {
            const errorText = await response.text()
            // 초당 호출 한도 초과 → 점증 backoff 후 재시도 (최대 3회)
            if (errorText.includes('EGW00201') && retryCount < 3) {
                await new Promise(r => setTimeout(r, 400 + retryCount * 400))
                return this.getKisOverseasPrice(symbol, retryCount + 1)
            }
            throw new Error(`KIS Overseas Price ${response.status}: ${errorText}`)
        }
        const data = await response.json()
        if (data.rt_cd !== '0') {
            if (String(data.msg_cd ?? '').includes('EGW00201') && retryCount < 3) {
                await new Promise(r => setTimeout(r, 400 + retryCount * 400))
                return this.getKisOverseasPrice(symbol, retryCount + 1)
            }
            throw new Error(`KIS Overseas Price: ${data.msg1}`)
        }
        // output: { last, diff, rate, ... }
        const price = parseFloat(data.output?.last)
        const change = parseFloat(data.output?.diff)
        const changeRate = parseFloat(data.output?.rate)
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error(`KIS Overseas Price: invalid price for ${symbol}`)
        }
        return { price, change: change || 0, changeRate: changeRate || 0 }
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

            const response = await fetchWithTimeout(`${BASE_URL}${path}?${params}`, {
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

        // Overseas Stock (US) — Yahoo historical() 은 429 전량 차단 위험이 커서
        // KIS 해외 일별시세(getDailyPriceRange, HHDFS76240000)로 조회한다.
        else {
            try {
                // 정확한 거래소(EXCD) 추론 후 단일 날짜를 포함하는 짧은 범위를 조회.
                const excd = await resolveUsExcd(symbol, market)
                const rangeMarket = excd === 'NYS' ? 'NYSE' : excd === 'AMS' ? 'AMEX' : 'NASD'
                const endObj = new Date(new Date(date).getTime() + 86400000 * 4) // +4일(주말/시차 버퍼)
                const end = endObj.toISOString().split('T')[0]
                const range = await this.getDailyPriceRange(symbol, rangeMarket, date, end)
                return range.find((item) => item.date === date) ?? null
            } catch (error) {
                console.error(`KIS US Daily Price Error for ${symbol}:`, error)
                return null
            }
        }
    }

    async getDailyPriceRange(symbol: string, market: 'KOSPI' | 'KOSDAQ' | 'US' | 'NASD' | 'NYSE' | 'AMEX', startDate: string, endDate: string): Promise<any[]> {
        try {
            const token = await this.getAccessToken()
            let formattedData: any[] = []

            // US stocks: Use KIS Overseas Daily Price API (HHDFS76240000)
            if (market === 'US' || market === 'NASD' || market === 'NYSE' || market === 'AMEX') {
                const path = '/uapi/overseas-price/v1/quotations/dailyprice'
                const tr_id = 'HHDFS76240000'

                // Map market code to KIS exchange code
                let exchangeCode = 'NAS' // default
                if (market === 'NASD') exchangeCode = 'NAS'
                else if (market === 'NYSE') exchangeCode = 'NYS'
                else if (market === 'AMEX') exchangeCode = 'AMS'

                let bymd = endDate.replace(/-/g, '')
                let allData: any[] = []
                let pageCount = 0
                const startTime = new Date(startDate).getTime()

                console.log(`[KIS] Fetching US chart for ${symbol} (${exchangeCode}, ${startDate} to ${endDate})`)

                do {
                    const params = new URLSearchParams({
                        AUTH: '',
                        EXCD: exchangeCode,
                        SYMB: symbol,
                        GUBN: '0',
                        BYMD: bymd,
                        MODP: '1', // 주식분할 조정
                    })

                    const response = await fetchWithTimeout(`${BASE_URL}${path}?${params}`, {
                        headers: {
                            'Content-Type': 'application/json',
                            authorization: `Bearer ${token}`,
                            appkey: APP_KEY!,
                            appsecret: APP_SECRET!,
                            tr_id: tr_id,
                            custtype: 'P',
                        },
                        cache: 'no-store',
                    })

                    if (!response.ok) throw new Error(`KIS API Error: ${response.status}`)

                    const data = await response.json()
                    if (data.rt_cd !== '0' || !data.output2?.length) break

                    const newItems = data.output2.filter((item: any) =>
                        !allData.some(existing => existing.xymd === item.xymd)
                    )
                    allData.push(...newItems)
                    pageCount++

                    const oldestDate = allData[allData.length - 1].xymd
                    const oldestDateStr = `${oldestDate.substring(0, 4)}-${oldestDate.substring(4, 6)}-${oldestDate.substring(6, 8)}`
                    if (new Date(oldestDateStr).getTime() <= startTime) break

                    const oldestDateObj = new Date(oldestDateStr)
                    oldestDateObj.setDate(oldestDateObj.getDate() - 1)
                    bymd = oldestDateObj.toISOString().split('T')[0].replace(/-/g, '')

                    await new Promise(resolve => setTimeout(resolve, 100))
                    if (data.output2.length < 50 || pageCount >= 100) break
                } while (true)

                console.log(`[KIS] US: ${allData.length} data points (${pageCount} pages)`)

                const endTime = new Date(endDate).getTime()
                formattedData = allData
                    .filter((item: any) => {
                        const d = `${item.xymd.substring(0, 4)}-${item.xymd.substring(4, 6)}-${item.xymd.substring(6, 8)}`
                        const t = new Date(d).getTime()
                        return t >= startTime && t <= endTime
                    })
                    .map((item: any) => ({
                        date: `${item.xymd.substring(0, 4)}-${item.xymd.substring(4, 6)}-${item.xymd.substring(6, 8)}`,
                        close: parseFloat(item.clos),
                        open: parseFloat(item.open),
                        high: parseFloat(item.high),
                        low: parseFloat(item.low),
                        volume: parseInt(item.tvol || 0),
                    }))
                    .reverse()
            }
            // Korean stocks: Use KIS Domestic Daily Price API (FHKST03010100)
            else if (market === 'KOSPI' || market === 'KOSDAQ') {
                const path = '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice'
                const tr_id = 'FHKST03010100'

                // Remove Yahoo Finance suffix (.KS, .KQ) if present
                const cleanSymbol = symbol.replace(/\.(KS|KQ)$/, '')

                let bymd = endDate.replace(/-/g, '')
                let allData: any[] = []
                let pageCount = 0
                const startTime = new Date(startDate).getTime()

                console.log(`[KIS] Fetching KR chart for ${cleanSymbol} (${market}, ${startDate} to ${endDate})`)

                do {
                    const params = new URLSearchParams({
                        FID_COND_MRKT_DIV_CODE: 'J',
                        FID_INPUT_ISCD: cleanSymbol,
                        FID_INPUT_DATE_1: startDate.replace(/-/g, ''),
                        FID_INPUT_DATE_2: bymd,
                        FID_PERIOD_DIV_CODE: 'D',
                        FID_ORG_ADJ_PRC: '1', // 수정주가
                    })

                    const response = await fetchWithTimeout(`${BASE_URL}${path}?${params}`, {
                        headers: {
                            'Content-Type': 'application/json',
                            authorization: `Bearer ${token}`,
                            appkey: APP_KEY!,
                            appsecret: APP_SECRET!,
                            tr_id: tr_id,
                            custtype: 'P',
                        },
                        cache: 'no-store',
                    })

                    if (!response.ok) throw new Error(`KIS API Error: ${response.status}`)

                    const data = await response.json()
                    if (data.rt_cd !== '0' || !data.output2?.length) break

                    const newItems = data.output2.filter((item: any) =>
                        !allData.some(existing => existing.stck_bsop_date === item.stck_bsop_date)
                    )
                    allData.push(...newItems)
                    pageCount++

                    const oldestDate = allData[allData.length - 1].stck_bsop_date
                    const oldestDateStr = `${oldestDate.substring(0, 4)}-${oldestDate.substring(4, 6)}-${oldestDate.substring(6, 8)}`
                    if (new Date(oldestDateStr).getTime() <= startTime) break

                    const oldestDateObj = new Date(oldestDateStr)
                    oldestDateObj.setDate(oldestDateObj.getDate() - 1)
                    bymd = oldestDateObj.toISOString().split('T')[0].replace(/-/g, '')

                    await new Promise(resolve => setTimeout(resolve, 100))
                    if (data.output2.length < 50 || pageCount >= 100) break
                } while (true)

                console.log(`[KIS] KR: ${allData.length} data points (${pageCount} pages)`)

                const endTime = new Date(endDate).getTime()
                formattedData = allData
                    .filter((item: any) => {
                        const d = `${item.stck_bsop_date.substring(0, 4)}-${item.stck_bsop_date.substring(4, 6)}-${item.stck_bsop_date.substring(6, 8)}`
                        const t = new Date(d).getTime()
                        return t >= startTime && t <= endTime
                    })
                    .map((item: any) => ({
                        date: `${item.stck_bsop_date.substring(0, 4)}-${item.stck_bsop_date.substring(4, 6)}-${item.stck_bsop_date.substring(6, 8)}`,
                        close: parseFloat(item.stck_clpr),
                        open: parseFloat(item.stck_oprc),
                        high: parseFloat(item.stck_hgpr),
                        low: parseFloat(item.stck_lwpr),
                        volume: parseInt(item.acml_vol || 0),
                    }))
                    .reverse()
            }

            return formattedData
        } catch (error) {
            console.error(`KIS Chart Error for ${symbol}:`, error)
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

            const response = await fetchWithTimeout(`${BASE_URL}${path}?${params}`, {
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
