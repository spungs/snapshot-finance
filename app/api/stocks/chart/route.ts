import { NextRequest, NextResponse } from 'next/server'
import { kisClient } from '@/lib/api/kis-client'
import yahooFinance from '@/lib/yahoo-finance'
import { auth } from '@/lib/auth'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'

type Market = 'KOSPI' | 'KOSDAQ' | 'US' | 'NASD' | 'NYSE' | 'AMEX'

const US_PROBE_ORDER: Market[] = ['NASD', 'NYSE', 'AMEX']
const ALLOWED_MARKETS = new Set<Market>(['KOSPI', 'KOSDAQ', 'US', 'NASD', 'NYSE', 'AMEX'])
const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,15}$/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

async function fetchUSChartViaYahoo(symbol: string, startDate: string, endDate: string) {
    const period2 = new Date(new Date(endDate).getTime() + 86400000)
        .toISOString()
        .split('T')[0]

    const result = await yahooFinance.chart(symbol, {
        period1: startDate,
        period2,
        interval: '1d',
    })

    return (result?.quotes ?? [])
        .filter((q) => q && q.close != null && q.date)
        .map((q) => ({
            date: new Date(q.date).toISOString().split('T')[0],
            close: q.adjclose ?? q.close,
            open: q.open,
            high: q.high,
            low: q.low,
            volume: q.volume,
        }))
}

export async function GET(request: NextRequest) {
    try {
        // 인증 + rate limit — 외부 KIS/Yahoo 호출 비용 보호
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }
        const rl = await checkRateLimit(ratelimit.api, session.user.id)
        if (rl && !rl.success) {
            return NextResponse.json(
                { success: false, error: { code: 'RATE_LIMIT', message: '너무 많은 요청입니다.' } },
                { status: 429 }
            )
        }

        const { searchParams } = new URL(request.url)
        const symbol = searchParams.get('symbol')
        const market = searchParams.get('market') as Market | null
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')

        if (!symbol || !market || !startDate || !endDate) {
            return NextResponse.json(
                { success: false, error: { message: 'Missing required parameters' } },
                { status: 400 }
            )
        }

        if (!SYMBOL_PATTERN.test(symbol) || !ALLOWED_MARKETS.has(market) || !ISO_DATE_PATTERN.test(startDate) || !ISO_DATE_PATTERN.test(endDate)) {
            return NextResponse.json(
                { success: false, error: { message: 'Invalid parameter format' } },
                { status: 400 }
            )
        }

        // US generic market — KIS expects a specific exchange code (NAS/NYS/AMS).
        // Probe in order, return on first non-empty result.
        if (market === 'US') {
            for (const probe of US_PROBE_ORDER) {
                try {
                    const data = await kisClient.getDailyPriceRange(symbol, probe, startDate, endDate)
                    if (data.length > 0) {
                        return NextResponse.json({ success: true, data, exchange: probe })
                    }
                } catch (err) {
                    console.warn(`[chart] KIS ${probe} failed for ${symbol}:`, (err as Error).message)
                }
            }

            // KIS exhausted — try Yahoo as last resort (often rate-limited)
            try {
                const data = await fetchUSChartViaYahoo(symbol, startDate, endDate)
                return NextResponse.json({ success: true, data, exchange: 'YAHOO' })
            } catch (err) {
                console.warn(`[chart] Yahoo also failed for ${symbol}:`, (err as Error).message)
                return NextResponse.json({ success: true, data: [] })
            }
        }

        // KR or already-specific US exchange
        const data = await kisClient.getDailyPriceRange(symbol, market, startDate, endDate)
        return NextResponse.json({ success: true, data })
    } catch (error) {
        console.error('Stock chart data fetch error:', error)
        return NextResponse.json(
            { success: false, error: { message: 'Failed to fetch stock chart data' } },
            { status: 500 }
        )
    }
}
