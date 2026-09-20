import { NextRequest, NextResponse } from 'next/server'
import { kisClient } from '@/lib/api/kis-client'
import { auth } from '@/lib/auth'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'

/**
 * 주어진 날짜가 거래일인지 판정하고, 아니면 직전 거래일을 알려준다.
 *
 * 공휴일 캘린더를 두지 않는 이유: 매년 갱신해야 하고 임시 휴장을 놓친다.
 * 실제로 2021-12-31 은 미국은 열렸지만 한국 증시는 폐장일이었다.
 * 그래서 대표 종목의 실제 시세가 존재하는 날을 거래일로 본다.
 *
 * 양쪽 시장을 모두 보유한 스냅샷은 **둘 다 열린 날**이어야 한 날짜로 기록할 수 있다.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// 연휴가 길어도 닿도록 넉넉히 뒤로 본다 (설·추석 + 주말).
const LOOKBACK_DAYS = 14

// 거래일 판정용 대표 종목. 상장 폐지·거래정지 위험이 가장 낮은 대형주.
const PROBE = {
    KR: { symbol: '005930', market: 'KOSPI' as const },
    US: { symbol: 'AAPL', market: 'NASD' as const },
}

function shiftDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d + days))
    return dt.toISOString().split('T')[0]
}

/** 해당 시장에서 date 이하의 거래일들을 최신순으로 반환. */
async function tradingDaysUpTo(market: 'KR' | 'US', date: string): Promise<string[]> {
    const probe = PROBE[market]
    const from = shiftDays(date, -LOOKBACK_DAYS)
    const rows = await kisClient.getDailyPriceRange(probe.symbol, probe.market, from, date)
    return rows
        .map((r: { date?: string }) => r?.date)
        .filter((d): d is string => typeof d === 'string' && d <= date)
        .sort((a, b) => (a < b ? 1 : -1))
}

export async function GET(request: NextRequest) {
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
    const date = searchParams.get('date')
    if (!date || !ISO_DATE_PATTERN.test(date)) {
        return NextResponse.json(
            { success: false, error: { message: 'Invalid date' } },
            { status: 400 }
        )
    }

    // markets=KR,US — 보유 종목이 걸친 시장. 미지정이면 둘 다 본다.
    const raw = (searchParams.get('markets') || 'KR,US').split(',').map(v => v.trim().toUpperCase())
    const markets = (['KR', 'US'] as const).filter(m => raw.includes(m))
    if (markets.length === 0) {
        return NextResponse.json(
            { success: false, error: { message: 'Invalid markets' } },
            { status: 400 }
        )
    }

    try {
        const lists = await Promise.all(markets.map(m => tradingDaysUpTo(m, date)))

        // 모든 대상 시장이 함께 열린 날 중 가장 가까운 과거 날짜.
        const [first, ...rest] = lists
        const common = first.filter(d => rest.every(list => list.includes(d)))
        const tradingDay = common[0] ?? null

        if (!tradingDay) {
            // 조회 실패(키 문제·범위 밖 등)면 날짜를 건드리지 않는다 — 조용한 변경이 더 나쁘다.
            return NextResponse.json({
                success: true,
                data: { requested: date, isTradingDay: true, tradingDay: date, resolved: false },
            })
        }

        return NextResponse.json({
            success: true,
            data: {
                requested: date,
                isTradingDay: tradingDay === date,
                tradingDay,
                resolved: true,
            },
        })
    } catch (error) {
        console.error('Trading day lookup error:', error)
        // 실패 시에도 날짜를 바꾸지 않는다.
        return NextResponse.json({
            success: true,
            data: { requested: date, isTradingDay: true, tradingDay: date, resolved: false },
        })
    }
}
