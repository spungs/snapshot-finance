
import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { prisma } from '@/lib/prisma'

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

        // 2. English Search - Use Yahoo Finance
        const yf = new YahooFinance()
        const results = await yf.search(query)

        const formattedResults = results.quotes
            .filter((quote: any) => quote.quoteType === 'EQUITY' || quote.quoteType === 'ETF')
            .map((quote: any) => ({
                symbol: quote.symbol,
                name: quote.shortname || quote.longname || quote.symbol,
                exchange: quote.exchange,
                type: quote.quoteType,
                market: quote.exchange === 'KOE' ? 'KOSPI' : quote.exchange === 'KO' ? 'KOSDAQ' : 'US',
            }))

        return NextResponse.json({ success: true, data: formattedResults })

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
