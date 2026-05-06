import { NextRequest, NextResponse } from 'next/server'
import { kisClient } from '@/lib/api/kis-client'
import { auth } from '@/lib/auth'
import { ratelimit, getIP, checkRateLimit } from '@/lib/ratelimit'

const ALLOWED_MARKETS = new Set(['KOSPI', 'KOSDAQ', 'US'])
const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,15}$/i

export async function GET(request: NextRequest) {
    // 인증 확인 — 외부 KIS/Finnhub 호출이 발생하므로 비인증 호출 차단
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json(
            { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
            { status: 401 }
        )
    }

    // user.id 기준 rate limit (인증된 사용자라도 abuse 방지)
    const rl = await checkRateLimit(ratelimit.api, session.user.id)
    if (rl && !rl.success) {
        return NextResponse.json(
            { success: false, error: { code: 'RATE_LIMIT', message: '너무 많은 요청입니다.' } },
            { status: 429, headers: { 'X-RateLimit-Reset': rl.reset.toString() } }
        )
    }

    const searchParams = request.nextUrl.searchParams
    const symbol = searchParams.get('symbol')
    const market = searchParams.get('market') as 'KOSPI' | 'KOSDAQ' | 'US' | null

    if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
        return NextResponse.json({ success: false, error: 'Invalid symbol' }, { status: 400 })
    }

    const marketType = market && ALLOWED_MARKETS.has(market) ? market : 'KOSPI'

    // 잘못된 IP fallback 방지(rate limit이 사용자ID 기준이라 IP는 모니터링용)
    void getIP(request)

    try {
        const priceData = await kisClient.getCurrentPrice(symbol, marketType)
        return NextResponse.json({ success: true, data: priceData })
    } catch (error: any) {
        console.error('Price fetch error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'PRICE_FETCH_FAILED', message: 'Price Fetch Failed' } },
            { status: 500 }
        )
    }
}
