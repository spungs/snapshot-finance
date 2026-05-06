import { NextRequest, NextResponse } from 'next/server'
import { kisClient } from '@/lib/api/kis-client'
import { auth } from '@/lib/auth'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'

const ALLOWED_MARKETS = new Set(['KOSPI', 'KOSDAQ', 'US', 'FX'])
const SYMBOL_PATTERN = /^[A-Z0-9.=\-]{1,15}$/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
    try {
        // 인증 + rate limit
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
        const market = searchParams.get('market') as 'KOSPI' | 'KOSDAQ' | 'US' | 'FX'
        const date = searchParams.get('date')

        if (!symbol || !market || !date) {
            return NextResponse.json(
                { success: false, error: { message: 'Missing required parameters' } },
                { status: 400 }
            )
        }

        if (!SYMBOL_PATTERN.test(symbol) || !ALLOWED_MARKETS.has(market) || !ISO_DATE_PATTERN.test(date)) {
            return NextResponse.json(
                { success: false, error: { message: 'Invalid parameter format' } },
                { status: 400 }
            )
        }

        // Special handling for FX (Exchange Rate)
        if (market === 'FX') {
            // Use 'US' logic in kisClient which uses Yahoo Finance, valid for tickers like "KRW=X"
            const result = await kisClient.getDailyPrice(symbol, 'US', date)
            return NextResponse.json({ success: true, data: result })
        }

        const result = await kisClient.getDailyPrice(symbol, market, date)

        if (!result) {
            return NextResponse.json(
                { success: false, error: { message: 'No data found for this date' } },
                { status: 404 }
            )
        }

        return NextResponse.json({ success: true, data: result })
    } catch (error) {
        console.error('Historical price fetch error:', error)
        return NextResponse.json(
            { success: false, error: { message: 'Failed to fetch historical price' } },
            { status: 500 }
        )
    }
}
