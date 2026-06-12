import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { mergeHoldingsByStock } from '@/lib/services/snapshot-service'
import Decimal from 'decimal.js'
import { format } from 'date-fns'

// 사용자×종목을 순차 처리 + 청크당 sleep(throttle) 하므로 실행시간이 사용자 수에
// 비례해 늘어난다. 기본 함수 타임아웃으로 중간 사용자 스냅샷이 누락되지 않도록
// 명시적으로 상향 (update-prices 와 동일 정책). 사용자가 크게 늘면 추가 상향 검토.
export const maxDuration = 60

// Unified Cron Job: Daily Snapshot + User Maintenance
// Schedule: 22:30 UTC Mon-Fri (07:30 KST Tue-Sat / 화~토)

// Helper function to fetch price.
// 실패/0 가격을 그대로 반환하면 snapshot_holdings.currentPrice = 0 으로 저장되어
// totalValue 과소·profitRate ≈ -100% 가 되므로, 0 반환 대신 throw 하여
// 상위 호출부가 skip(개별) / abort(>50%) 를 결정하게 한다.
async function getStockPrice(symbol: string, market: string): Promise<number> {
    // Map market for KIS Client
    let marketType: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI'
    if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS') {
        marketType = 'US'
    } else if (market === 'KOSDAQ' || market === 'KQ') {
        marketType = 'KOSDAQ'
    }

    const priceData = await kisClient.getCurrentPrice(symbol, marketType)
    if (!priceData || !Number.isFinite(priceData.price) || priceData.price <= 0) {
        throw new Error(`Invalid price (${priceData?.price}) for ${symbol} (${market})`)
    }
    return priceData.price
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// KIS 시세 API 는 "초당 20건" 제한이 있다. 한 사용자의 전 종목을 Promise.all 로
// 한꺼번에 띄우고 사용자까지 병렬로 돌리면 동시 호출이 한도를 넘어 EGW00201 로
// 전부 실패 → (>50% abort) 스냅샷 자체가 생성되지 않는다. 현재가 조회를 청크로
// 끊고 청크 사이에 간격을 둬 동시 호출 수를 제한한다. (update-prices cron 과 동일 패턴)
const PRICE_CHUNK_SIZE = 8
const PRICE_CHUNK_DELAY_MS = 1100

export async function GET(request: NextRequest) {
    // 1. Authentication
    const authHeader = request.headers.get('authorization')
    if (!isAuthorizedCron(authHeader)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const results: any[] = []
    let errorLogged = false

    try {
        // 2. Logic Branching based on Day of Week
        const now = new Date()
        const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
        // Run Snapshot on Mon-Fri UTC (Tue-Sat KST)
        // This covers the full trading week.
        const isSnapshotDay = dayOfWeek >= 1 && dayOfWeek <= 5

        // ---------------------------------------------------------
        // A. Snapshot Creation (Mon-Fri UTC)
        // ---------------------------------------------------------
        if (isSnapshotDay) {
            console.log(`[Cron] Start Daily Snapshot (Day: ${dayOfWeek})`)

            const users = await prisma.user.findMany({
                where: {
                    isAutoSnapshotEnabled: true,
                },
                include: {
                    holdings: {
                        include: { stock: true },
                        orderBy: { createdAt: 'asc' }
                    },
                },
            })

            console.log(`[Cron] Found ${users.length} users for snapshot.`)
            const usdRate = await getUsdExchangeRate()
            console.log(`[Cron] Using USD Rate: ${usdRate}`)

            // 사용자는 순차 처리 — 각 사용자 내부 현재가 조회를 청크로 throttle 하므로,
            // 사용자까지 병렬로 돌리면 동시 KIS 호출이 "초당 20건" 한도를 넘어 EGW00201 로
            // 전부 실패한다. 사용자 수가 적어 순차여도 전체 소요는 수십 초 내.
            const USER_BATCH_SIZE = 1

            const processUser = async (user: typeof users[number]) => {
                try {
                    if (user.holdings.length === 0) {
                        return { userId: user.id, status: 'skipped', reason: 'No holdings' }
                    }

                    // 여러 계좌에 분산된 같은 종목을 stockCode 단위로 통합 (가중평균 평단 + 합계 수량)
                    const merged = mergeHoldingsByStock(user.holdings)
                    const usdRateDec = new Decimal(usdRate || 0)

                    // 1) 종목별 현재가 조회 — 실패 종목은 0원 저장 대신 skip 으로 표시.
                    //    KIS 초당 호출 한도(EGW00201) 회피를 위해 청크 단위로 throttle 한다.
                    const priced: { holding: (typeof merged)[number]; currentPrice: number; ok: boolean }[] = []
                    for (let c = 0; c < merged.length; c += PRICE_CHUNK_SIZE) {
                        const chunk = merged.slice(c, c + PRICE_CHUNK_SIZE)
                        const chunkResults = await Promise.all(
                            chunk.map(async (holding) => {
                                try {
                                    const currentPrice = await getStockPrice(holding.stock.stockCode, holding.stock.market || 'Unknown')
                                    return { holding, currentPrice, ok: true as const }
                                } catch (priceError) {
                                    console.warn(`[Cron] Skip ${holding.stock.stockCode} (${holding.stock.market}) for user ${user.id}: price fetch failed.`, priceError)
                                    return { holding, currentPrice: 0, ok: false as const }
                                }
                            })
                        )
                        priced.push(...chunkResults)
                        if (c + PRICE_CHUNK_SIZE < merged.length) await sleep(PRICE_CHUNK_DELAY_MS)
                    }

                    const succeeded = priced.filter((p) => p.ok)
                    const skippedCodes = priced.filter((p) => !p.ok).map((p) => p.holding.stock.stockCode)

                    // 2) 현재가 조회 실패 비율이 50% 초과면 스냅샷 신뢰 불가 → 전체 abort
                    //    (0원 종목이 절반 넘는 스냅샷을 저장하면 totalValue·profitRate 가 심하게 왜곡됨)
                    if (skippedCodes.length / merged.length > 0.5) {
                        throw new Error(
                            `Price fetch failed for ${skippedCodes.length}/${merged.length} holdings (>50%). Aborting snapshot. Skipped: ${skippedCodes.join(', ')}`
                        )
                    }

                    // 3) 현재가 조회 성공 종목만으로 스냅샷 구성 + 합계 계산 (모든 합계는 Decimal로)
                    let totalValue = new Decimal(0)
                    let totalCost = new Decimal(0)

                    const snapshotHoldingsData = succeeded.map(({ holding, currentPrice }) => {
                        const quantity = holding.quantity
                        const avgPrice = holding.averagePrice
                        const cur = new Decimal(currentPrice || 0)

                        const val = cur.times(quantity)
                        const cost = avgPrice.times(quantity)

                        // 매입금액은 매입 시점 환율(purchaseRate)로 동결 — 환율 변동만으로 매입금액이 출렁이지 않게 함
                        // purchaseRate 누락/legacy(1)면 현재 환율로 폴백
                        const purchaseRate = holding.purchaseRate
                        const effectivePurchaseRate = purchaseRate.gt(0) && !purchaseRate.equals(1)
                            ? purchaseRate
                            : usdRateDec
                        const krwValue = holding.currency === 'USD' ? val.times(usdRateDec) : val
                        const krwCost = holding.currency === 'USD' ? cost.times(effectivePurchaseRate) : cost

                        totalValue = totalValue.plus(krwValue)
                        totalCost = totalCost.plus(krwCost)

                        const hProfit = val.minus(cost)
                        const hProfitRate = cost.isZero() ? new Decimal(0) : hProfit.div(cost).times(100)

                        return {
                            stockCode: holding.stockCode,
                            quantity: quantity,
                            averagePrice: avgPrice,
                            currentPrice: cur,
                            currency: holding.currency,
                            totalCost: cost,
                            currentValue: val,
                            profit: hProfit,
                            profitRate: hProfitRate,
                            purchaseRate: purchaseRate.gt(0) ? purchaseRate : usdRateDec,
                        }
                    })

                    const totalProfit = totalValue.minus(totalCost)
                    const profitRate = totalCost.isZero() ? new Decimal(0) : totalProfit.div(totalCost).times(100)

                    const newSnapshot = await prisma.portfolioSnapshot.create({
                        data: {
                            userId: user.id,
                            snapshotDate: new Date(),
                            totalValue,
                            totalCost,
                            totalProfit,
                            profitRate,
                            cashBalance: user.cashBalance || new Decimal(0), // Capture current cash balance
                            // 계좌별 분해 동결 — 없으면 SQL NULL (스냅샷 상세 UI 측 fallback)
                            cashAccounts: user.cashAccounts
                                ? (user.cashAccounts as Prisma.InputJsonValue)
                                : Prisma.DbNull,
                            exchangeRate: usdRateDec,
                            note: `자동 · ${format(new Date(), 'yyyy-MM-dd')}`,
                            holdings: {
                                create: snapshotHoldingsData,
                            },
                        },
                    })

                    return {
                        userId: user.id,
                        status: 'success' as const,
                        snapshotId: newSnapshot.id,
                        ...(skippedCodes.length > 0 ? { skippedHoldings: skippedCodes } : {}),
                    }
                } catch (error) {
                    console.error(`[Cron] Error processing user ${user.id}:`, error)
                    return { userId: user.id, status: 'failed' as const, error: error instanceof Error ? error.message : 'Unknown error' }
                }
            }

            for (let i = 0; i < users.length; i += USER_BATCH_SIZE) {
                const batch = users.slice(i, i + USER_BATCH_SIZE)
                const batchResults = await Promise.all(batch.map(processUser))
                results.push(...batchResults)
                console.log(`[Cron] Batch ${Math.floor(i / USER_BATCH_SIZE) + 1}/${Math.ceil(users.length / USER_BATCH_SIZE)} done (${batchResults.length} users)`)
            }
        } else {
            console.log(`[Cron] Skipping Snapshot (Day: ${dayOfWeek}). Market closed.`)
            results.push({ status: 'skipped', reason: 'Weekend (Market Closed)' })
        }

        // ---------------------------------------------------------
        // B. User Cleanup (Always Runs)
        // ---------------------------------------------------------
        try {
            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

            const deletedUsers = await prisma.user.deleteMany({
                where: {
                    deletedAt: {
                        lt: thirtyDaysAgo,
                    },
                },
            })
            if (deletedUsers.count > 0) {
                console.log(`[Cron] Cleaned up ${deletedUsers.count} expired users.`)
                results.push({ action: 'cleanup', deletedCount: deletedUsers.count })
            }
        } catch (cleanupError) {
            console.error('[Cron] User cleanup failed:', cleanupError)
        }

        return NextResponse.json({ success: true, results })
    } catch (error) {
        console.error('[Cron] Job failed:', error)

        // Log Critical Failure
        try {
            const message = error instanceof Error ? error.message : String(error)

            await prisma.cronLog.create({
                data: {
                    jobName: 'DailySnapshot',
                    status: 'FAILED',
                    message: message,
                    details: { error: error as any, results }
                }
            })
            errorLogged = true
        } catch (logError) {
            console.error('[Cron] Failed to save error log to DB:', logError)
        }

        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    } finally {
        // Log Success/Partial — error 경로에서 이미 FAILED를 적었으면 중복 로그 방지
        if (!errorLogged && results.length > 0) {
            try {
                const failedCount = results.filter((r: any) => r.status === 'failed').length
                const skippedHoldingsCount = results.reduce(
                    (acc: number, r: any) => acc + (Array.isArray(r.skippedHoldings) ? r.skippedHoldings.length : 0),
                    0
                )
                const status = failedCount > 0 ? (failedCount === results.length ? 'FAILED' : 'PARTIAL') : 'SUCCESS'

                await prisma.cronLog.create({
                    data: {
                        jobName: 'DailySnapshot',
                        status: status,
                        message: `Processed ${results.length} items. Failed: ${failedCount}. Skipped holdings: ${skippedHoldingsCount}`,
                        details: { results }
                    }
                })
            } catch (logError) {
                console.error('[Cron] Failed to save log to DB:', logError)
            }
        }
    }
}
