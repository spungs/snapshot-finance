/**
 * scripts/backfill-snapshots.ts
 *
 * 누락된 일간 자동 스냅샷을 과거 종가로 소급 생성한다.
 *
 * 배경 (2026-06):
 *   KIS 초당 한도(EGW00201) 초과로 daily-snapshot cron 이 06-08 이후 중단 →
 *   06-08, 06-09, 06-10 자동 스냅샷이 누락됨. 이 스크립트가 해당 거래일의
 *   "확정 종가"로 PortfolioSnapshot + SnapshotHolding 을 소급 생성한다.
 *
 * 정확성 원칙:
 *   - daily-snapshot cron 은 DATE 21:30 UTC(양 시장 마감 후)에 실행되어
 *     KR/US 모두 "같은 거래일(DATE)" 종가를 동결한다. (검증 완료)
 *   - 따라서 백필도 STRICT: getDailyPriceRange 결과 중 date === DATE 인
 *     "확정 종가"만 사용한다. 해당 날짜 행이 없으면(미마감/장중/휴장) 그 종목은
 *     skip — 직전일 종가로 폴백하지 않는다(불변 기록 오염 방지).
 *   - 현재가 조회 실패 비율 > 50% 면 스냅샷 전체 abort (cron 과 동일 가드).
 *   - 환율은 해당 날짜의 USD→KRW 히스토리 환율을 동결(폴백: 현재 환율).
 *
 * 대상:
 *   - 활성 사용자: isAutoSnapshotEnabled = true AND deletedAt = null
 *   - 날짜: CLI 인자(YYYY-MM-DD ...) 또는 기본값 [06-08, 06-09, 06-10]
 *   - 이미 해당 UTC 날짜 스냅샷이 있는 사용자는 건너뜀(멱등)
 *
 * 실행:
 *   npx tsx scripts/backfill-snapshots.ts                                  # dry-run (기본 날짜)
 *   npx tsx scripts/backfill-snapshots.ts --execute                        # 실제 생성 (기본 날짜)
 *   npx tsx scripts/backfill-snapshots.ts --execute 2026-06-11             # 특정 날짜
 *   npx tsx scripts/backfill-snapshots.ts --execute 2026-06-08 2026-06-09  # 여러 날짜
 */

import path from 'path'
import dotenv from 'dotenv'
import Decimal from 'decimal.js'

// @/lib/* 가 모듈 평가 시점에 env 를 읽으므로 dotenv 가 먼저여야 한다.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })

import { Prisma } from '@prisma/client'

const EXECUTE = process.argv.includes('--execute')
const KIS_DELAY_MS = 250 // 종목 간 KIS 호출 간격 (EGW00201 회피)
const SNAPSHOT_UTC_TIME = 'T21:30:00.000Z' // cron 실행 슬롯과 동일하게 정렬

const DEFAULT_DATES = ['2026-06-08', '2026-06-09', '2026-06-10']
const DATES = (() => {
    const dateArgs = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
    return dateArgs.length > 0 ? dateArgs : DEFAULT_DATES
})()

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function maskDbUrl(url?: string): string {
    if (!url) return '(DATABASE_URL 없음)'
    return url.replace(/:\/\/([^:/@]+):[^@]+@/, '://$1:****@')
}

// Stock.market 원본 → getDailyPriceRange 가 받는 시장 코드
function toRangeMarket(rawMarket: string | null | undefined): 'KOSPI' | 'KOSDAQ' | 'NASD' | 'NYSE' | 'AMEX' {
    const m = rawMarket ?? ''
    if (['US', 'NAS', 'NASD'].includes(m)) return 'NASD'
    if (['NYS', 'NYSE'].includes(m)) return 'NYSE'
    if (['AMS', 'AMEX'].includes(m)) return 'AMEX'
    if (['KOSDAQ', 'KQ'].includes(m)) return 'KOSDAQ'
    return 'KOSPI'
}

/** 해당 날짜의 USD→KRW 히스토리 환율. 실패 시 null. */
async function fetchHistoricalUsdRate(date: string): Promise<number | null> {
    const urls = [
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`,
        `https://${date}.currency-api.pages.dev/v1/currencies/usd.json`,
    ]
    for (const url of urls) {
        try {
            const res = await fetch(url, { cache: 'no-store' })
            if (!res.ok) continue
            const data = await res.json()
            const rate = data?.usd?.krw
            if (typeof rate === 'number' && rate > 0) return rate
        } catch {
            // 다음 미러
        }
    }
    return null
}

async function main() {
    const { prisma } = await import('@/lib/prisma')
    const { kisClient } = await import('@/lib/api/kis-client')
    const { getUsdExchangeRate } = await import('@/lib/api/exchange-rate')

    console.log(`\n${'='.repeat(64)}`)
    console.log(`  backfill-snapshots  [${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}]`)
    console.log(`${'='.repeat(64)}`)
    console.log(`DB    : ${maskDbUrl(process.env.DATABASE_URL)}`)
    console.log(`날짜  : ${DATES.join(', ')}`)
    console.log(`현재  : ${new Date().toISOString()} (UTC)`)
    console.log()

    // ── 1. 활성 사용자 ─────────────────────────────────────────────
    const users = await prisma.user.findMany({
        where: { isAutoSnapshotEnabled: true, deletedAt: null },
        include: { holdings: { include: { stock: true }, orderBy: { createdAt: 'asc' } } },
    })
    console.log(`활성 사용자: ${users.length}명`)
    for (const u of users) console.log(`  · ${u.id.slice(0, 8)} (${u.email ?? '?'})  holdings=${u.holdings.length}`)
    console.log()

    // ── 2. 전 종목 과거시세 사전 수집 (종목당 KIS 1회, 전 날짜 공용) ──
    const minDate = DATES.reduce((a, b) => (a < b ? a : b))
    const maxDate = DATES.reduce((a, b) => (a > b ? a : b))
    // 비거래일 대비 시작일을 7일 앞으로 — 단, 사용은 STRICT(정확한 날짜)만.
    const fetchStart = (() => {
        const d = new Date(minDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7)
        return d.toISOString().split('T')[0]
    })()

    type StockMeta = { stockCode: string; market: string | null; nameKo: string }
    const uniqueStocks = new Map<string, StockMeta>()
    for (const u of users) for (const h of u.holdings) {
        if (!uniqueStocks.has(h.stock.stockCode)) {
            uniqueStocks.set(h.stock.stockCode, { stockCode: h.stock.stockCode, market: h.stock.market, nameKo: h.stock.nameKo })
        }
    }
    console.log(`고유 종목 ${uniqueStocks.size}개 과거시세 수집 (${fetchStart} ~ ${maxDate})…`)

    // priceCache[stockCode][YYYY-MM-DD] = close (>0)
    const priceCache = new Map<string, Map<string, number>>()
    for (const meta of uniqueStocks.values()) {
        const rangeMarket = toRangeMarket(meta.market)
        const dayMap = new Map<string, number>()
        try {
            const rows: Array<{ date: string; close: number }> = await kisClient.getDailyPriceRange(
                meta.stockCode, rangeMarket, fetchStart, maxDate,
            )
            for (const r of rows ?? []) {
                if (Number(r.close) > 0) dayMap.set(r.date, Number(r.close))
            }
            const hits = DATES.filter((d) => dayMap.has(d))
            console.log(`  ${meta.stockCode.padEnd(8)} ${meta.nameKo.slice(0, 14).padEnd(14)} [${rangeMarket.padEnd(5)}] → 확정종가 ${hits.length}/${DATES.length}일 (${hits.join(',') || '없음'})`)
        } catch (e) {
            console.log(`  ${meta.stockCode.padEnd(8)} ${meta.nameKo.slice(0, 14).padEnd(14)} [${rangeMarket.padEnd(5)}] → ✗ 조회 실패: ${e instanceof Error ? e.message : e}`)
        }
        priceCache.set(meta.stockCode, dayMap)
        await sleep(KIS_DELAY_MS)
    }
    console.log()

    // ── 3. 날짜별 환율 수집 ────────────────────────────────────────
    const rateByDate = new Map<string, Decimal>()
    for (const date of DATES) {
        let rate = await fetchHistoricalUsdRate(date)
        let src = '히스토리'
        if (!rate) { rate = await getUsdExchangeRate(); src = '현재(폴백)' }
        rateByDate.set(date, new Decimal(rate))
        console.log(`환율 ${date}: ${rate} (${src})`)
    }
    console.log()

    // ── 4. 날짜 × 사용자 스냅샷 생성 ───────────────────────────────
    let created = 0
    let skippedExisting = 0
    let abortedUsers = 0
    const holdingFails: string[] = []
    const summary: string[] = []

    for (const date of DATES) {
        const usdRate = rateByDate.get(date)!
        const snapshotDate = new Date(date + SNAPSHOT_UTC_TIME)
        const gte = new Date(date + 'T00:00:00.000Z')
        const lt = new Date(date + 'T23:59:59.999Z')
        console.log(`\n── [${date}] (snapshotDate ${snapshotDate.toISOString()}, fx ${usdRate}) ──`)

        for (const user of users) {
            // 4-a. 멱등: 이미 해당 날짜 스냅샷이 있으면 skip
            const exists = await prisma.portfolioSnapshot.count({
                where: { userId: user.id, snapshotDate: { gte, lte: lt } },
            })
            if (exists > 0) {
                console.log(`  ${user.id.slice(0, 8)}: 이미 존재 → skip`)
                skippedExisting++
                continue
            }
            if (user.holdings.length === 0) {
                console.log(`  ${user.id.slice(0, 8)}: 보유 없음 → skip`)
                continue
            }

            // 4-b. 종목 통합 (가중평균 평단 + 합계 수량)
            const { mergeHoldingsByStock } = await import('@/lib/services/snapshot-service')
            const merged = mergeHoldingsByStock(user.holdings)

            // 4-c. STRICT: 해당 날짜 확정 종가만 사용
            const priced = merged.map((holding) => {
                const close = priceCache.get(holding.stockCode)?.get(date) ?? 0
                return { holding, currentPrice: close, ok: close > 0 }
            })
            const succeeded = priced.filter((p) => p.ok)
            const skippedCodes = priced.filter((p) => !p.ok).map((p) => p.holding.stockCode)

            if (skippedCodes.length / merged.length > 0.5) {
                console.log(`  ${user.id.slice(0, 8)}: ✗ ABORT — 확정종가 누락 ${skippedCodes.length}/${merged.length} (>50%): ${skippedCodes.join(', ')}`)
                abortedUsers++
                holdingFails.push(...skippedCodes.map((c) => `${c}(${date},abort)`))
                continue
            }
            if (skippedCodes.length > 0) {
                holdingFails.push(...skippedCodes.map((c) => `${c}(${date},skip)`))
            }

            // 4-d. 합계 계산 (cron 과 동일 로직)
            let totalValue = new Decimal(0)
            let totalCost = new Decimal(0)
            const snapshotHoldingsData = succeeded.map(({ holding, currentPrice }) => {
                const quantity = holding.quantity
                const avgPrice = holding.averagePrice
                const cur = new Decimal(currentPrice)
                const val = cur.times(quantity)
                const cost = avgPrice.times(quantity)

                const purchaseRate = holding.purchaseRate
                const effectivePurchaseRate = purchaseRate.gt(0) && !purchaseRate.equals(1) ? purchaseRate : usdRate
                const krwValue = holding.currency === 'USD' ? val.times(usdRate) : val
                const krwCost = holding.currency === 'USD' ? cost.times(effectivePurchaseRate) : cost
                totalValue = totalValue.plus(krwValue)
                totalCost = totalCost.plus(krwCost)

                const hProfit = val.minus(cost)
                const hProfitRate = cost.isZero() ? new Decimal(0) : hProfit.div(cost).times(100)
                return {
                    stockCode: holding.stockCode,
                    quantity,
                    averagePrice: avgPrice,
                    currentPrice: cur,
                    currency: holding.currency,
                    totalCost: cost,
                    currentValue: val,
                    profit: hProfit,
                    profitRate: hProfitRate,
                    purchaseRate: purchaseRate.gt(0) ? purchaseRate : usdRate,
                }
            })

            const totalProfit = totalValue.minus(totalCost)
            const profitRate = totalCost.isZero() ? new Decimal(0) : totalProfit.div(totalCost).times(100)

            const label = `${user.id.slice(0, 8)}: ${succeeded.length}종목 tv=${totalValue.toFixed(0)} tp=${totalProfit.toFixed(0)} pr=${profitRate.toFixed(2)}%` +
                (skippedCodes.length ? ` (skip ${skippedCodes.length})` : '')

            if (!EXECUTE) {
                console.log(`  ${label}  [DRY-RUN]`)
                continue
            }

            // 4-e. 단일 트랜잭션 생성
            try {
                const snap = await prisma.portfolioSnapshot.create({
                    data: {
                        userId: user.id,
                        snapshotDate,
                        totalValue,
                        totalCost,
                        totalProfit,
                        profitRate,
                        cashBalance: user.cashBalance || new Decimal(0),
                        cashAccounts: user.cashAccounts ? (user.cashAccounts as Prisma.InputJsonValue) : Prisma.DbNull,
                        exchangeRate: usdRate,
                        note: `${date} 자동(백필)`,
                        holdings: { create: snapshotHoldingsData },
                    },
                })
                console.log(`  ✅ ${label}  id=${snap.id.slice(0, 12)}`)
                created++
                summary.push(`${date} ${user.id.slice(0, 8)} → ${snap.id}`)
            } catch (e) {
                console.log(`  ❌ ${user.id.slice(0, 8)}: 트랜잭션 실패 — ${e instanceof Error ? e.message : e}`)
                holdingFails.push(`${user.id.slice(0, 8)}(${date},tx-fail)`)
            }
        }
    }

    // ── 5. 차트 캐시 무효화 (생성된 경우) ──────────────────────────
    if (EXECUTE && created > 0) {
        const { snapshotService } = await import('@/lib/services/snapshot-service')
        for (const user of users) await snapshotService.invalidateChart(user.id)
        console.log(`\n차트 캐시 무효화: ${users.length}명`)
    }

    // ── 6. 요약 ────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(64)}`)
    console.log(`  백필 요약  [${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}]`)
    console.log(`${'='.repeat(64)}`)
    console.log(`  생성된 스냅샷       : ${created}건`)
    console.log(`  이미 존재(skip)     : ${skippedExisting}건`)
    console.log(`  사용자 abort(>50%)  : ${abortedUsers}건`)
    console.log(`  종목 skip/실패      : ${holdingFails.length}건`)
    if (holdingFails.length) console.log(`     ${holdingFails.join(', ')}`)
    if (summary.length) { console.log(`  생성 목록:`); for (const s of summary) console.log(`     - ${s}`) }
    if (!EXECUTE) console.log(`\n  DRY-RUN — DB 미변경. 실제 반영: --execute`)
    console.log()

    await prisma.$disconnect()
}

main().catch((e) => { console.error('스크립트 실패:', e); process.exit(1) })
