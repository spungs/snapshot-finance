
import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from '@/lib/yahoo-finance'
import { prisma } from '@/lib/prisma'
import { ratelimit, getIP, checkRateLimit } from '@/lib/ratelimit'
import { cacheGet, cacheSet } from '@/lib/cache'

// Redis 기반 검색 결과 캐시 — 외부 API rate limit 보호용
// 이전 in-memory Map은 Vercel Serverless 인스턴스간 공유 안 되어 효과 미미했음
const SEARCH_CACHE_TTL_SECONDS = 60 * 60 * 6 // 6 hours
const searchCacheKey = (query: string) => `stocks:search:${query.toLowerCase()}`

// Yahoo/Finnhub 결과에는 한글명이 없으므로, KIS 마스터 DB에서 ticker 기준으로 보완.
// US 종목 한정 (NASD/NYSE/AMEX) — 단일 IN 쿼리로 배치 처리.
const US_MASTER_MARKETS = ['NASD', 'NYSE', 'AMEX']

async function enrichWithKisMaster(
    results: Array<{ symbol: string; nameKo?: string | null; nameEn?: string | null; [key: string]: unknown }>
): Promise<typeof results> {
    // nameKo가 이미 있는 항목은 스킵 (KIS DB 경로로 온 결과)
    const missingSymbols = results
        .filter(r => !r.nameKo)
        .map(r => r.symbol)

    if (missingSymbols.length === 0) return results

    const masters = await prisma.stock.findMany({
        where: {
            stockCode: { in: missingSymbols },
            market: { in: US_MASTER_MARKETS },
        },
        select: { stockCode: true, nameKo: true, nameEn: true },
    })

    const masterMap = new Map(masters.map(m => [m.stockCode, m]))

    return results.map(r => {
        if (r.nameKo) return r
        const master = masterMap.get(r.symbol)
        if (!master) return r
        return {
            ...r,
            nameKo: master.nameKo || null,
            nameEn: master.nameEn || (r.name as string) || null,
        }
    })
}

export async function GET(request: NextRequest) {
    // Rate limiting
    const ip = getIP(request)
    const rateLimitResult = await checkRateLimit(ratelimit.search, ip)

    if (rateLimitResult && !rateLimitResult.success) {
        return NextResponse.json(
            { success: false, error: 'Too many requests. Please try again later.' },
            {
                status: 429,
                headers: {
                    'X-RateLimit-Limit': rateLimitResult.limit.toString(),
                    'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
                    'X-RateLimit-Reset': rateLimitResult.reset.toString(),
                }
            }
        )
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')

    if (!query) {
        return NextResponse.json({ success: false, error: 'Query is required' }, { status: 400 })
    }

    try {
        // 1. Check for Korean characters
        const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(query)

        if (hasKorean) {
            // Search in DB (KIS Master)
            const stocks = await prisma.stock.findMany({
                where: {
                    nameKo: {
                        contains: query,
                        mode: 'insensitive',
                    }
                },
                orderBy: [
                    { stockCode: 'asc' },
                ],
                take: 50,
            })

            if (stocks.length > 0) {
                // 일반 주식을 ETF보다 우선 표시 (영문 검색과 동일한 로직)
                const sortedStocks = stocks.sort((a, b) => {
                    // ETF 판별: 한국 종목은 stockCode 6자리 룰 + ETF/ETN regex, 미국 종목은 regex 만 (ticker 가 4자라 길이 룰 부적용)
                    const aIsKr = a.market === 'KOSPI' || a.market === 'KOSDAQ'
                    const bIsKr = b.market === 'KOSPI' || b.market === 'KOSDAQ'
                    const aIsEtf = (aIsKr && a.stockCode.length !== 6) || /ETF|ETN/i.test(a.nameEn || '')
                    const bIsEtf = (bIsKr && b.stockCode.length !== 6) || /ETF|ETN/i.test(b.nameEn || '')

                    if (aIsEtf !== bIsEtf) {
                        return aIsEtf ? 1 : -1
                    }

                    if (a.stockCode.length !== b.stockCode.length) {
                        return a.stockCode.length - b.stockCode.length
                    }

                    const aEngLen = (a.nameEn || '').length
                    const bEngLen = (b.nameEn || '').length
                    return aEngLen - bEngLen
                }).slice(0, 10)

                const formattedResults = sortedStocks.map(stock => ({
                    symbol: stock.stockCode,
                    name: stock.nameEn || stock.nameKo,  // 기본 표시명 (영문명 우선)
                    nameKo: stock.nameKo,                 // 한글명
                    nameEn: stock.nameEn,                 // 영문명
                    exchange: stock.market === 'KOSPI' ? 'KSC' : 'KOE',
                    market: stock.market,
                    type: 'EQUITY',
                    isDbResult: true
                }))

                return NextResponse.json({ success: true, data: formattedResults })
            }
            // If no results in DB, fall back to Yahoo Finance
        }

        // 2. English or Stock Code Search - Use DB first, then Yahoo Finance
        // 정렬 우선순위: ticker(stockCode) 완전 일치 > prefix > 포함
        //                > nameKo/nameEn prefix > 포함
        // alphabet 컷오프(K~Z 잘림) 방지 위해 후보를 넉넉히 확보 후 JS 정렬
        const dbStocks = await prisma.stock.findMany({
            where: {
                OR: [
                    { nameEn: { contains: query, mode: 'insensitive' } },
                    { nameKo: { contains: query, mode: 'insensitive' } },
                    { stockCode: { contains: query, mode: 'insensitive' } },
                ]
            },
            take: 300,
        })

        if (dbStocks.length > 0) {
            const q = query.toLowerCase()
            const scoreOf = (s: typeof dbStocks[number]) => {
                const code = s.stockCode.toLowerCase()
                const name = (s.nameKo || '').toLowerCase()
                const eng = (s.nameEn || '').toLowerCase()
                if (code === q) return 0
                if (code.startsWith(q)) return 1
                if (code.includes(q)) return 2
                if (name.startsWith(q) || eng.startsWith(q)) return 3
                return 4
            }

            const formattedResults = dbStocks
                .map(stock => ({ stock, score: scoreOf(stock) }))
                .sort((a, b) => {
                    if (a.score !== b.score) return a.score - b.score
                    if (a.stock.stockCode.length !== b.stock.stockCode.length) {
                        return a.stock.stockCode.length - b.stock.stockCode.length
                    }
                    return (a.stock.nameEn || '').length - (b.stock.nameEn || '').length
                })
                .slice(0, 50)
                .map(({ stock }) => ({
                    symbol: stock.stockCode,
                    name: stock.nameEn || stock.nameKo,
                    nameKo: stock.nameKo,
                    nameEn: stock.nameEn,
                    exchange: stock.market === 'KOSPI' ? 'KSC' : 'KOE',
                    market: stock.market,
                    type: 'EQUITY',
                    isDbResult: true,
                }))

            return NextResponse.json({ success: true, data: formattedResults })
        }

        // 2. English Search - Use Yahoo Finance
        try {
            // Check Redis cache first
            // 캐시된 결과도 KIS 마스터로 보완 — 캐시 기록 당시 nameKo 가 없었던 경우 대비.
            // enrichWithKisMaster 가 nameKo 있는 항목은 스킵하므로 이중 DB 조회 없음.
            const cacheKey = searchCacheKey(query)
            const cached = await cacheGet<any[]>(cacheKey)

            if (cached) {
                const enriched = await enrichWithKisMaster(cached)
                return NextResponse.json({ success: true, data: enriched, source: 'cache' })
            }

            // Use singleton instance to share session/cookies and avoid rate limits
            const results = await yahooFinance.search(query)

            // Yahoo 가 같은 ticker 의 다른 listing (ex: HIMS NYSE + HIMS NMS) 을 별개 quote 로
            // 반환하는 경우가 있어 symbol+market 으로 dedup. 첫 등장만 유지.
            const seenKeys = new Set<string>()
            const rawResults = results.quotes
                .filter((quote: any) =>
                    quote.quoteType === 'EQUITY' ||
                    quote.quoteType === 'ETF' ||
                    quote.quoteType === 'ETN' // Add ETN support (e.g. FNGU)
                )
                .map((quote: any) => ({
                    symbol: quote.symbol,
                    name: quote.shortname || quote.longname || quote.symbol,
                    exchange: quote.exchange,
                    type: quote.quoteType,
                    market: quote.exchange === 'KOE' ? 'KOSPI' : quote.exchange === 'KO' ? 'KOSDAQ' : 'US',
                }))
                .filter((r: any) => {
                    const key = `${r.symbol}|${r.market}`
                    if (seenKeys.has(key)) return false
                    seenKeys.add(key)
                    return true
                })

            // KIS 마스터에서 한글명 보완 후 캐시 (한글명 포함 상태로 저장)
            const formattedResults = await enrichWithKisMaster(rawResults)
            await cacheSet(cacheKey, formattedResults, SEARCH_CACHE_TTL_SECONDS)

            return NextResponse.json({ success: true, data: formattedResults })
        } catch (yahooError: any) {
            console.warn('Yahoo Search Failed:', yahooError.message)

            // 3. Fallback to Finnhub Symbol Search
            try {
                const apiKey = process.env.FINNHUB_API_KEY
                if (!apiKey) {
                    console.warn('FINNHUB_API_KEY not configured, returning empty results')
                    return NextResponse.json({ success: true, data: [] })
                }

                console.log('Trying Finnhub Symbol Search...')
                const response = await fetch(
                    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&exchange=US&token=${apiKey}`,
                    { cache: 'no-store' }
                )

                if (!response.ok) {
                    throw new Error(`Finnhub API error: ${response.status}`)
                }

                const data = await response.json()

                // Finnhub returns: { count, result: [{ description, displaySymbol, symbol, type }] }
                const finnhubSeen = new Set<string>()
                const rawFinnhubResults = (data.result || [])
                    .filter((item: any) =>
                        item.type === 'Common Stock' ||
                        item.type === 'ETP' || // ETF/ETN
                        item.type === 'ADR'
                    )
                    .slice(0, 10)
                    .map((item: any) => ({
                        symbol: item.symbol,
                        name: item.description || item.displaySymbol || item.symbol,
                        exchange: 'US',
                        type: item.type === 'Common Stock' ? 'EQUITY' : item.type === 'ETP' ? 'ETF' : 'EQUITY',
                        market: 'US',
                        source: 'finnhub'
                    }))
                    .filter((r: any) => {
                        const key = `${r.symbol}|${r.market}`
                        if (finnhubSeen.has(key)) return false
                        finnhubSeen.add(key)
                        return true
                    })

                // KIS 마스터에서 한글명 보완 후 캐시
                const formattedResults = await enrichWithKisMaster(rawFinnhubResults)
                await cacheSet(searchCacheKey(query), formattedResults, SEARCH_CACHE_TTL_SECONDS)

                console.log(`Finnhub Search Success: ${formattedResults.length} results`)
                return NextResponse.json({ success: true, data: formattedResults, source: 'finnhub' })
            } catch (finnhubError: any) {
                console.warn('Finnhub Search Failed:', finnhubError.message)
                return NextResponse.json({ success: true, data: [] })
            }
        }

    } catch (error: any) {
        console.error('Search Error:', error)

        return NextResponse.json(
            {
                success: false,
                error: `Search Failed: ${error.message || error} `,
                details: JSON.stringify(error, Object.getOwnPropertyNames(error))
            },
            { status: 500 }
        )
    }
}
