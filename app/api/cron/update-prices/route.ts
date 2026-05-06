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

// 가격 갱신 cron — 보유 중인 유니크 종목만 KIS/Finnhub 으로 한 번씩 호출하고
// 결과를 Redis 공유 캐시(stock:price:{code})에 저장한다. 사용자 페이지 진입 시
// kisClient.getCurrentPrice 가 동일 키로 Redis 를 우선 읽으므로, KIS 호출이
// 사용자 수에 비례해 늘지 않는다.
//
// pg_cron 에 두 개 등록 — 시장별 시간대가 달라서:
//   update-prices-kr  ?market=KR  schedule: */3 0-6 * * 1-5  (UTC, KST 09~16)
//   update-prices-us  ?market=US  schedule: */3 13-22 * * 1-5 (UTC, KST 22~07)
//
// 운영 가정:
// - cron 주기 3분, 캐시 TTL 10분 → 한두 번 누락돼도 캐시는 살아있음.
// - KIS 도메인/해외 시세 API 모두 초당 20건 제한 → 15개 청크 + 1초 sleep.
// - 환율은 KR cron 에서만 갱신 (1일 변동폭이 작아 한쪽이면 충분).

export const maxDuration = 300

const CHUNK_SIZE = 15
const CHUNK_DELAY_MS = 1000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type Market = 'KR' | 'US'
type MarketType = 'KOSPI' | 'KOSDAQ' | 'US'

function parseMarketParam(raw: string | null): Market {
    return raw === 'US' ? 'US' : 'KR'
}

// Stock.market 컬럼 → kisClient.getCurrentPrice 가 받는 marketType 으로 정규화.
function resolveMarket(market: string | null | undefined): MarketType {
    if (!market) return 'KOSPI'
    if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS' ||
        market === 'NASD' || market === 'NYSE' || market === 'AMEX') return 'US'
    if (market === 'KOSDAQ' || market === 'KQ') return 'KOSDAQ'
    return 'KOSPI'
}

// 한국장: 평일 09:00~15:35 KST
function isKrMarketOpen(now: Date): { open: boolean; reason?: string } {
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const day = kst.getUTCDay()
    if (day === 0 || day === 6) return { open: false, reason: 'WEEKEND_KR' }
    const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes()
    if (minutes < 9 * 60 || minutes > 15 * 60 + 35) return { open: false, reason: 'OUTSIDE_HOURS_KR' }
    return { open: true }
}

// 미국 정규장 — DST 양쪽 커버. UTC 평일 13~22시.
// (정규장 EDT: UTC 13:30~20:00, EST: UTC 14:30~21:00. 양 끝에 ~30분 버퍼)
function isUsMarketOpen(now: Date): { open: boolean; reason?: string } {
    const day = now.getUTCDay()
    if (day === 0 || day === 6) return { open: false, reason: 'WEEKEND_US' }
    const hour = now.getUTCHours()
    if (hour < 13 || hour > 22) return { open: false, reason: 'OUTSIDE_HOURS_US' }
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
    // 1. 인증 — pg_cron 의 net.http_get 이 Authorization: Bearer ${CRON_SECRET} 부착
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const url = new URL(request.url)
    const targetMarket = parseMarketParam(url.searchParams.get('market'))
    const force = url.searchParams.get('force') === '1'

    // 2. 장 시간 체크 — 외 시간엔 즉시 종료해 KIS/Finnhub 호출 0건
    if (!force) {
        const m = targetMarket === 'KR' ? isKrMarketOpen(now) : isUsMarketOpen(now)
        if (!m.open) {
            return NextResponse.json({
                success: true,
                skipped: true,
                market: targetMarket,
                reason: m.reason ?? 'MARKET_CLOSED',
            })
        }
    }

    const results: UpdateResult[] = []
    let exchangeRateUpdated = false
    let exchangeRateValue: number | null = null
    let errorLogged = false

    try {
        // 3. 시장에 맞는 보유 종목만 추출 — Holding 1개라도 걸린 stock 만 갱신
        const marketFilter = targetMarket === 'US'
            ? { in: ['US', 'NASD', 'NYSE', 'AMEX', 'NAS', 'NYS', 'AMS'] }
            : { in: ['KOSPI', 'KOSDAQ', 'KS', 'KQ'] }

        const stocks = await prisma.stock.findMany({
            where: {
                liveHoldings: { some: {} },
                market: marketFilter,
            },
            select: { stockCode: true, market: true },
        })

        console.log(`[Cron:update-prices:${targetMarket}] ${stocks.length} unique stocks`)

        // 4. 환율은 KR cron 에서만 갱신 (1일 변동폭이 작아 한 번이면 충분)
        if (targetMarket === 'KR') {
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
                console.warn(`[Cron:update-prices:${targetMarket}] FX refresh failed:`, e)
            }
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
                        console.warn(`[Cron:update-prices:${targetMarket}] ${stockCode} failed:`, msg)
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
            market: targetMarket,
            stocksProcessed: results.length,
            successCount,
            failedCount,
            exchangeRateUpdated,
            exchangeRateValue,
        })
    } catch (error) {
        console.error(`[Cron:update-prices:${targetMarket}] Job failed:`, error)
        try {
            await prisma.cronLog.create({
                data: {
                    jobName: `UpdatePrices:${targetMarket}`,
                    status: 'FAILED',
                    message: error instanceof Error ? error.message : String(error),
                    details: { results, exchangeRateUpdated, exchangeRateValue } as any,
                },
            })
            errorLogged = true
        } catch (logError) {
            console.error(`[Cron:update-prices:${targetMarket}] Failed to save error log:`, logError)
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
                        jobName: `UpdatePrices:${targetMarket}`,
                        status,
                        message: `Processed ${results.length} stocks. Failed: ${failedCount}. FX updated: ${exchangeRateUpdated}`,
                        details: { failed: results.filter(r => r.status === 'failed') } as any,
                    },
                })
            } catch (logError) {
                console.error(`[Cron:update-prices:${targetMarket}] Failed to save log:`, logError)
            }
        }
    }
}
