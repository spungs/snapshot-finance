import { NextRequest, NextResponse } from 'next/server'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { ratelimit, getIP, checkRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    // IP rate limit — 캐시 미스 시 외부 환율 API 를 호출하므로 익명 남용을 방어.
    const rl = await checkRateLimit(ratelimit.api, getIP(request))
    if (rl && !rl.success) {
        return NextResponse.json(
            { success: false, error: 'Too many requests. Please try again later.' },
            { status: 429 },
        )
    }

    try {
        const rate = await getUsdExchangeRate()
        return NextResponse.json({ success: true, rate })
    } catch (error) {
        return NextResponse.json(
            { success: false, error: 'Failed to fetch exchange rate' },
            { status: 500 }
        )
    }
}
