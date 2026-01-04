
import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from '@/lib/yahoo-finance'
import { prisma } from '@/lib/prisma'

// Simple in-memory cache to prevent rate limiting
const SEARCH_CACHE = new Map<string, { data: any, timestamp: number }>()
const CACHE_TTL = 1000 * 60 * 60 * 6 // 6 hours

export async function GET(request: NextRequest) {
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
                        // mode: 'insensitive' // Not needed for Korean usually, but good for English mixed
                    }
                },
                take: 10,
            })

            if (stocks.length > 0) {
                const formattedResults = stocks.map(stock => ({
                    symbol: `${stock.stockCode}.KS`, // Default to .KS, logic needed for KOSDAQ (.KQ)
                    // Actually, KIS master has market.
                    // KOSPI -> .KS, KOSDAQ -> .KQ for Yahoo compatibility if we mix?
                    // Or just return code and let frontend/backend handle it.
                    // Our system uses Yahoo symbols usually.
                    // Let's map market to Yahoo suffix.
                    name: stock.stockName,
                    exchange: stock.market === 'KOSPI' ? 'KSC' : 'KOE', // Yahoo codes
                    market: stock.market,
                    type: 'EQUITY',
                    isDbResult: true
                })).map(s => ({
                    ...s,
                    symbol: s.market === 'KOSPI' ? `${s.symbol.split('.')[0]}.KS` : `${s.symbol.split('.')[0]}.KQ`
                }))

                return NextResponse.json({ success: true, data: formattedResults })
            }
            // If no results in DB, fall back to Yahoo Finance
        }

        // 2. English Search - Use Yahoo Finance
        try {
            // Check Cache first
            const now = Date.now()
            const cacheKey = query.toLowerCase()
            const cached = SEARCH_CACHE.get(cacheKey)

            if (cached && (now - cached.timestamp < CACHE_TTL)) {
                return NextResponse.json({ success: true, data: cached.data, source: 'cache' })
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

            // Update Cache
            // Limit cache size to prevent memory leak (simple approach)
            if (SEARCH_CACHE.size > 1000) {
                const firstKey = SEARCH_CACHE.keys().next().value
                if (firstKey) SEARCH_CACHE.delete(firstKey) // Remove oldest key (insertion order in Map)
            }
            SEARCH_CACHE.set(cacheKey, { data: formattedResults, timestamp: now })

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
                const now = Date.now()
                const cacheKey = query.toLowerCase()
                if (SEARCH_CACHE.size > 1000) {
                    const firstKey = SEARCH_CACHE.keys().next().value
                    if (firstKey) SEARCH_CACHE.delete(firstKey)
                }
                SEARCH_CACHE.set(cacheKey, { data: formattedResults, timestamp: now })

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
