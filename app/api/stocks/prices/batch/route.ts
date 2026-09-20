import { NextRequest, NextResponse } from 'next/server'
import { kisClient } from '@/lib/api/kis-client'
import { auth } from '@/lib/auth'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'

/**
 * 여러 종목의 가격을 한 번에 조회한다. `date` 를 주면 그 날짜의 종가, 없으면 현재가.
 *
 * 종목마다 GET /api/kis/price 또는 /api/stocks/history 를 따로 치면
 * ratelimit.api(10req/10s)에 즉시 걸려 일부 종목만 가격을 받는다. 스냅샷 작성 화면은
 * 가격이 빈 종목을 저장 대상에서 제외하므로, 그대로 두면 종목이 조용히 사라진다.
 * 여기서는 rate limit 을 1건만 소비하고 KIS 초당 한도(EGW00201)는 청크로 throttle 한다.
 */

const ALLOWED_MARKETS = new Set(['KOSPI', 'KOSDAQ', 'US'])
const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,15}$/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_ITEMS = 200
const CHUNK_SIZE = 8
const CHUNK_DELAY_MS = 1100

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Item = { symbol: string; market: 'KOSPI' | 'KOSDAQ' | 'US' }

export async function POST(request: NextRequest) {
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

    let body: { date?: unknown; items?: unknown }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { success: false, error: { message: 'Invalid JSON body' } },
            { status: 400 }
        )
    }

    const rawDate = body.date
    let date: string | null = null
    if (rawDate !== undefined && rawDate !== null && rawDate !== '') {
        if (typeof rawDate !== 'string' || !ISO_DATE_PATTERN.test(rawDate)) {
            return NextResponse.json(
                { success: false, error: { message: 'Invalid date' } },
                { status: 400 }
            )
        }
        date = rawDate
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
        return NextResponse.json(
            { success: false, error: { message: 'items는 필수입니다.' } },
            { status: 400 }
        )
    }
    if (body.items.length > MAX_ITEMS) {
        return NextResponse.json(
            { success: false, error: { message: `종목은 최대 ${MAX_ITEMS}개까지 허용됩니다.` } },
            { status: 400 }
        )
    }

    const items: Item[] = []
    for (const raw of body.items as Array<{ symbol?: unknown; market?: unknown }>) {
        const symbol = raw?.symbol
        const market = raw?.market
        if (typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) {
            return NextResponse.json(
                { success: false, error: { message: `Invalid symbol: ${String(symbol)}` } },
                { status: 400 }
            )
        }
        if (typeof market !== 'string' || !ALLOWED_MARKETS.has(market)) {
            return NextResponse.json(
                { success: false, error: { message: `Invalid market: ${String(market)}` } },
                { status: 400 }
            )
        }
        items.push({ symbol, market: market as Item['market'] })
    }

    // symbol → 가격. 조회 실패는 null 로 남겨 클라이언트가 "확인 불가"를 표시하게 한다.
    const prices: Record<string, number | null> = {}

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE)
        const results = await Promise.all(
            chunk.map(async ({ symbol, market }) => {
                try {
                    const price = date
                        ? (await kisClient.getDailyPrice(symbol, market, date))?.close
                        : (await kisClient.getCurrentPrice(symbol, market)).price
                    return [symbol, typeof price === 'number' && price > 0 ? price : null] as const
                } catch (e) {
                    console.warn(`[prices/batch] ${symbol} (${market}) @ ${date ?? 'now'} failed:`, e)
                    return [symbol, null] as const
                }
            })
        )
        for (const [symbol, price] of results) prices[symbol] = price
        if (i + CHUNK_SIZE < items.length) await sleep(CHUNK_DELAY_MS)
    }

    return NextResponse.json({ success: true, data: { date, prices } })
}
