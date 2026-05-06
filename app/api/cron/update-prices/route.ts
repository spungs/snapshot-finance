import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import {
    cacheSet,
    stockPriceKey,
    exchangeRateKey,
    PRICE_CACHE_TTL_SECONDS,
    EXCHANGE_RATE_CACHE_TTL_SECONDS,
    type PriceCacheEntry,
    type ExchangeRateCacheEntry,
} from '@/lib/cache'

// 가격 갱신 cron — 보유 중인 유니크 종목만 KIS API로 한 번씩 호출하고
// 결과를 Redis에 공유 캐시로 저장한다. 사용자 페이지 진입 시에는 Redis만
// 읽으면 되므로 KIS 호출이 사용자 수에 비례해 늘지 않는다.
//
// 운영 가정:
// - 평일 09:00~15:35 KST (한국장 + 미국장 프리마켓 직전까지) 사이에만 호출
// - cron 주기는 3분 (vercel.json), 캐시 TTL은 10분 → cron 한두 번 누락돼도
//   여전히 캐시가 살아있다.
// - KIS 도메인 시세 API는 초당 20건 제한 → 15개 청크 + 청크 사이 1초 sleep

export const maxDuration = 300

const CHUNK_SIZE = 15
const CHUNK_DELAY_MS = 1000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type MarketType = 'KOSPI' | 'KOSDAQ' | 'US'

function resolveMarket(market: string | null | undefined): MarketType {
    if (!market) return 'KOSPI'
    if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS') return 'US'
    if (market === 'KOSDAQ' || market === 'KQ') return 'KOSDAQ'
    return 'KOSPI'
}

function isMarketOpenKst(now: Date): { open: boolean; reason?: string } {
    // KST = UTC+9. UTC를 +9 한 가상의 Date 의 UTC 필드를 KST 로 해석해서 사용한다.
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const day = kst.getUTCDay() // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return { open: false, reason: 'WEEKEND' }
    const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes()
    const start = 9 * 60          // 09:00
    const end = 15 * 60 + 35      // 15:35
    if (minutes < start || minutes > end) return { open: false, reason: 'OUTSIDE_HOURS' }
    return { open: true }
}

interface UpdateResult {
    stockCode: string
    market: string | null
    status: 'success' | 'failed'
    price?: number
    error?: string
}

export async function GET(request: NextRequest) {
    // 1. 인증 — Vercel Cron 은 Authorization: Bearer ${CRON_SECRET} 헤더를 자동 부착
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // ?force=1 쿼리로 장 시간 체크 우회 (수동 워밍업 / 디버깅용)
    const url = new URL(request.url)
    const force = url.searchParams.get('force') === '1'

    // 2. 장 시간 체크 — 외 시간엔 즉시 종료해 KIS 호출 0건
    if (!force) {
        const market = isMarketOpenKst(now)
        if (!market.open) {
            return NextResponse.json({
                success: true,
                skipped: true,
                reason: market.reason ?? 'MARKET_CLOSED',
            })
        }
    }

    const results: UpdateResult[] = []
    let exchangeRateUpdated = false
    let exchangeRateValue: number | null = null
    let errorLogged = false

    try {
        // 3. 보유 종목 중 유니크한 (stockCode, market) 만 추출 — Holding 이 1개라도
        //    걸려있는 stock 만 가격을 갱신한다. (검색만 한 종목은 갱신 대상 아님)
        const stocks = await prisma.stock.findMany({
            where: { liveHoldings: { some: {} } },
            select: { stockCode: true, market: true },
        })

        console.log(`[Cron:update-prices] ${stocks.length} unique stocks to refresh`)

        // 4. 환율 갱신 — 1회만 호출, 모든 사용자가 공유
        try {
            const rate = await getUsdExchangeRate()
            if (rate > 0) {
                const entry: ExchangeRateCacheEntry = {
                    rate,
                    updatedAt: now.toISOString(),
                }
                await cacheSet(exchangeRateKey(), entry, EXCHANGE_RATE_CACHE_TTL_SECONDS)
                exchangeRateUpdated = true
                exchangeRateValue = rate
            }
        } catch (e) {
            console.warn('[Cron:update-prices] FX refresh failed:', e)
        }

        // 5. 종목 시세 갱신 — 청크 단위 + 청크 사이 sleep 으로 rate limit 보호
        for (let i = 0; i < stocks.length; i += CHUNK_SIZE) {
            const chunk = stocks.slice(i, i + CHUNK_SIZE)
            const chunkResults = await Promise.all(
                chunk.map(async ({ stockCode, market }): Promise<UpdateResult> => {
                    try {
                        const marketType = resolveMarket(market)
                        const priceData = await kisClient.getCurrentPrice(stockCode, marketType)
                        if (!Number.isFinite(priceData.price) || priceData.price <= 0) {
                            return { stockCode, market, status: 'failed', error: 'Invalid price' }
                        }
                        const entry: PriceCacheEntry = {
                            price: priceData.price,
                            currency: marketType === 'US' ? 'USD' : 'KRW',
                            change: priceData.change ?? 0,
                            changeRate: priceData.changeRate ?? 0,
                            updatedAt: now.toISOString(),
                        }
                        await cacheSet(stockPriceKey(stockCode), entry, PRICE_CACHE_TTL_SECONDS)
                        return { stockCode, market, status: 'success', price: priceData.price }
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e)
                        console.warn(`[Cron:update-prices] ${stockCode} failed:`, msg)
                        return { stockCode, market, status: 'failed', error: msg }
                    }
                })
            )
            results.push(...chunkResults)

            // 마지막 청크 뒤에는 sleep 안 한다 — 응답 latency 절감
            if (i + CHUNK_SIZE < stocks.length) {
                await sleep(CHUNK_DELAY_MS)
            }
        }

        const failedCount = results.filter(r => r.status === 'failed').length
        const successCount = results.length - failedCount

        return NextResponse.json({
            success: true,
            stocksProcessed: results.length,
            successCount,
            failedCount,
            exchangeRateUpdated,
            exchangeRateValue,
        })
    } catch (error) {
        console.error('[Cron:update-prices] Job failed:', error)
        try {
            await prisma.cronLog.create({
                data: {
                    jobName: 'UpdatePrices',
                    status: 'FAILED',
                    message: error instanceof Error ? error.message : String(error),
                    details: { results, exchangeRateUpdated, exchangeRateValue } as any,
                },
            })
            errorLogged = true
        } catch (logError) {
            console.error('[Cron:update-prices] Failed to save error log:', logError)
        }
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    } finally {
        if (!errorLogged && results.length > 0) {
            try {
                const failedCount = results.filter(r => r.status === 'failed').length
                const status = failedCount === 0
                    ? 'SUCCESS'
                    : failedCount === results.length ? 'FAILED' : 'PARTIAL'
                await prisma.cronLog.create({
                    data: {
                        jobName: 'UpdatePrices',
                        status,
                        message: `Processed ${results.length} stocks. Failed: ${failedCount}. FX updated: ${exchangeRateUpdated}`,
                        details: { failed: results.filter(r => r.status === 'failed') } as any,
                    },
                })
            } catch (logError) {
                console.error('[Cron:update-prices] Failed to save log:', logError)
            }
        }
    }
}
