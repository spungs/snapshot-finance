import { NextRequest, NextResponse } from 'next/server'
import { getUsdExchangeRate, getUsdExchangeRateOn } from '@/lib/api/exchange-rate'
import { ratelimit, getIP, checkRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
    // IP rate limit — 캐시 미스 시 외부 환율 API 를 호출하므로 익명 남용을 방어.
    const rl = await checkRateLimit(ratelimit.api, getIP(request))
    if (rl && !rl.success) {
        return NextResponse.json(
            { success: false, error: 'Too many requests. Please try again later.' },
            { status: 429 },
        )
    }

    // ?date=YYYY-MM-DD → 그 날짜의 환율. 과거 스냅샷 작성용.
    const date = request.nextUrl.searchParams.get('date')
    if (date) {
        if (!ISO_DATE_PATTERN.test(date)) {
            return NextResponse.json(
                { success: false, error: 'Invalid date format' },
                { status: 400 },
            )
        }
        try {
            const rate = await getUsdExchangeRateOn(date)
            if (rate === null) {
                return NextResponse.json(
                    { success: false, error: 'No exchange rate found for this date' },
                    { status: 404 },
                )
            }
            return NextResponse.json({ success: true, rate, date })
        } catch (error) {
            return NextResponse.json(
                { success: false, error: 'Failed to fetch exchange rate' },
                { status: 500 },
            )
        }
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
