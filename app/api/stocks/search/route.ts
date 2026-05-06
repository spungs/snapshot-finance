
import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from '@/lib/yahoo-finance'
import { prisma } from '@/lib/prisma'
import { ratelimit, getIP, checkRateLimit } from '@/lib/ratelimit'
import { cacheGet, cacheSet } from '@/lib/cache'

// Redis 기반 검색 결과 캐시 — 외부 API rate limit 보호용
// 이전 in-memory Map은 Vercel Serverless 인스턴스간 공유 안 되어 효과 미미했음
const SEARCH_CACHE_TTL_SECONDS = 60 * 60 * 6 // 6 hours
const searchCacheKey = (query: string) => `stocks:search:${query.toLowerCase()}`

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
            const stocks = await prisma.kisStockMaster.findMany({
                where: {
                    stockName: {
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
                    const aIsEtf = a.stockCode.length !== 6 || /ETF|ETN/i.test(a.engName || '')
                    const bIsEtf = b.stockCode.length !== 6 || /ETF|ETN/i.test(b.engName || '')

                    if (aIsEtf !== bIsEtf) {
                        return aIsEtf ? 1 : -1
                    }

                    if (a.stockCode.length !== b.stockCode.length) {
                        return a.stockCode.length - b.stockCode.length
                    }

                    const aEngLen = (a.engName || '').length
                    const bEngLen = (b.engName || '').length
                    return aEngLen - bEngLen
                }).slice(0, 10)

                const formattedResults = sortedStocks.map(stock => ({
                    symbol: stock.stockCode,
                    name: stock.engName || stock.stockName,  // 기본 표시명 (영문명 우선)
                    nameKo: stock.stockName,                 // 한글명
                    nameEn: stock.engName,                   // 영문명
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
        // Check DB for English name or stock code match
        const dbStocks = await prisma.kisStockMaster.findMany({
            where: {
                OR: [
                    {
                        engName: {
                            contains: query,
                            mode: 'insensitive'  // 대소문자 구분 없이
                        }
                    },
                    {
                        stockCode: {
                            contains: query
                        }
                    }
                ]
            },
            orderBy: [
                // 1. 종목코드 길이 (짧을수록 주요 종목 - ETF는 보통 길다)
                { stockCode: 'asc' },
            ],
            take: 50,  // 더 많은 결과를 가져온 후 필터링
        })

        if (dbStocks.length > 0) {
            // 일반 주식을 ETF보다 우선 표시
            const sortedStocks = dbStocks.sort((a, b) => {
                // ETF/ETN 여부 확인 (종목코드가 6자리가 아니거나, 영문명에 ETF/ETN 포함)
                const aIsEtf = a.stockCode.length !== 6 || /ETF|ETN/i.test(a.engName || '')
                const bIsEtf = b.stockCode.length !== 6 || /ETF|ETN/i.test(b.engName || '')

                if (aIsEtf !== bIsEtf) {
                    return aIsEtf ? 1 : -1  // 일반 주식 우선
                }

                // 같은 타입이면 종목코드 길이순 (짧을수록 주요 종목)
                if (a.stockCode.length !== b.stockCode.length) {
                    return a.stockCode.length - b.stockCode.length
                }

                // 종목코드 길이가 같으면 영문명 길이순 (짧을수록 주요 종목)
                const aEngLen = (a.engName || '').length
                const bEngLen = (b.engName || '').length
                return aEngLen - bEngLen
            })

            // 일반 주식이 하나라도 있는지 확인
            const hasNonEtf = sortedStocks.some(stock => {
                return stock.stockCode.length === 6 && !/ETF|ETN/i.test(stock.engName || '')
            })

            // 일반 주식이 있으면 상위 10개 반환, 없으면 Yahoo Finance로 fallback
            if (hasNonEtf) {
                const formattedResults = sortedStocks.slice(0, 50).map(stock => ({
                    symbol: stock.stockCode,
                    name: stock.engName || stock.stockName,  // 기본 표시명 (영문명 우선)
                    nameKo: stock.stockName,                 // 한글명
                    nameEn: stock.engName,                   // 영문명
                    exchange: stock.market === 'KOSPI' ? 'KSC' : 'KOE',
                    market: stock.market,
                    type: 'EQUITY',
                    isDbResult: true
                }))

                return NextResponse.json({ success: true, data: formattedResults })
            }
            // hasNonEtf가 false이면 아래 Yahoo Finance 로직으로 fallthrough
        }

        // 2. English Search - Use Yahoo Finance
        try {
            // Check Redis cache first
            const cacheKey = searchCacheKey(query)
            const cached = await cacheGet<any[]>(cacheKey)

            if (cached) {
                return NextResponse.json({ success: true, data: cached, source: 'cache' })
            }

            // Use singleton instance to share session/cookies and avoid rate limits
            const results = await yahooFinance.search(query)

            const formattedResults = results.quotes
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
                const formattedResults = (data.result || [])
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

                // Cache Finnhub results too
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
