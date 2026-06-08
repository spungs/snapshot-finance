/**
 * scripts/repair-snapshot-zero-prices.ts
 *
 * portfolio_snapshots / snapshot_holdings 테이블의 currentPrice <= 0 데이터를
 * KIS 과거 시세(국내) / Yahoo Finance(미국)로 복구하고,
 * 부모 portfolio_snapshot 의 totalValue / totalProfit / profitRate 를 재계산한다.
 *
 * 발생 원인 (2026-06 분석 결과):
 *   1. KIS 자격증명(APP_KEY/APP_SECRET) 만료 → 가격 조회 throw → getStockPrice() 가 0 반환
 *   2. CRON_SECRET 불일치 기간(2026-05-30~06-02)에 update-prices cron 중단 → Redis 캐시 만료
 *      → daily-snapshot 이 KIS 직접 호출 시 자격증명 만료와 겹쳐 0 저장
 *   결과: daily-snapshot 이 snapshot_holdings.currentPrice = 0 으로 레코드 생성
 *         → totalValue 과소, profitRate ≈ -100% 표시
 *
 * 수리 전략:
 *   - KR 종목: KIS inquiry-daily-price (FHKST01010400) — 최근 ~30 거래일 조회 가능
 *   - US 종목: Yahoo Finance historical — 날짜 무제한
 *   - LSE 종목: stooq 가 과거 시세 미지원 → SKIP (수동 확인 필요)
 *   - 비거래일(공휴일 등) → 최대 5 영업일 전까지 소급하여 찾음
 *   - 부모 스냅샷 재계산: snapshot.exchangeRate 기준으로 USD 종목 KRW 환산
 *
 * 실행 방법:
 *   npx tsx scripts/repair-snapshot-zero-prices.ts               # dry-run (기본)
 *   npx tsx scripts/repair-snapshot-zero-prices.ts --execute     # 실제 DB 수정
 *   npx tsx scripts/repair-snapshot-zero-prices.ts --execute --snapshot-id <id>
 *   npx tsx scripts/repair-snapshot-zero-prices.ts --execute --date 2026-06-02
 *
 * 안전장치:
 *   - dry-run 이 기본. --execute 없으면 DB 무수정.
 *   - 양수 currentPrice 가 이미 있으면 절대 덮어쓰지 않음 (WHERE currentPrice <= 0).
 *   - 트랜잭션: 스냅샷 단위(holdings + 부모 갱신)로 원자적 처리.
 *   - KIS rate limit: 요청 간 200ms 딜레이.
 */

import path from 'path'
import dotenv from 'dotenv'
import Decimal from 'decimal.js'

// @/lib/prisma 등이 모듈 평가 시점에 환경변수를 읽으므로 dotenv 가 먼저여야 한다.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })

const EXECUTE = process.argv.includes('--execute')
const DELAY_MS = 200
const MAX_DATE_FALLBACK = 5 // 비거래일 소급 최대 일수

/** CLI 옵션 파싱 */
function getArgValue(flag: string): string | null {
    const idx = process.argv.indexOf(flag)
    return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null
}

const TARGET_SNAPSHOT_ID = getArgValue('--snapshot-id')
const TARGET_DATE        = getArgValue('--date') // YYYY-MM-DD (UTC)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function maskDbUrl(url?: string): string {
    if (!url) return '(DATABASE_URL 없음)'
    return url.replace(/:\/\/([^:/@]+):[^@]+@/, '://$1:****@')
}

type MarketType = 'KOSPI' | 'KOSDAQ' | 'US' | 'LSE'

/** Stock.market 컬럼 값 → 내부 MarketType 으로 정규화 */
function resolveMarket(market: string | null | undefined): MarketType {
    if (!market) return 'KOSPI'
    if (['US', 'NAS', 'NYS', 'AMS', 'NASD', 'NYSE', 'AMEX'].includes(market)) return 'US'
    if (['KOSDAQ', 'KQ'].includes(market)) return 'KOSDAQ'
    if (market === 'LSE') return 'LSE'
    return 'KOSPI'
}

/**
 * daily-snapshot cron 이 22:30 UTC 에 실행되므로 UTC date 가 실제 거래일과 일치.
 */
function toDateStr(d: Date): string {
    return d.toISOString().split('T')[0]
}

/** dateStr 에서 N일 전 날짜 문자열 반환 */
function subtractDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - days)
    return toDateStr(d)
}

interface PriceResult {
    price: number
    usedDate: string      // 실제로 데이터를 찾은 날짜
    fallbackDays: number  // 소급한 일수 (0 = 요청 날짜 당일)
}

/**
 * 국내 / 해외 종목의 과거 종가 조회.
 * 비거래일이면 MAX_DATE_FALLBACK 일 이전까지 순차 소급.
 * LSE 는 과거 시세 불가 → null 반환.
 */
async function fetchHistoricalPrice(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kisClient: any,
    stockCode: string,
    market: MarketType,
    targetDate: string,
): Promise<PriceResult | null> {
    if (market === 'LSE') return null

    // narrowed to 'KOSPI' | 'KOSDAQ' | 'US' after the LSE guard above
    const domainMarket = market as 'KOSPI' | 'KOSDAQ' | 'US'

    for (let i = 0; i <= MAX_DATE_FALLBACK; i++) {
        const dateStr = subtractDays(targetDate, i)
        try {
            const data = await kisClient.getDailyPrice(stockCode, domainMarket, dateStr)
            if (data && Number(data.close) > 0) {
                return { price: Number(data.close), usedDate: dateStr, fallbackDays: i }
            }
        } catch {
            // 해당 날짜 조회 실패 → 소급 계속
        }
        await sleep(DELAY_MS)
    }
    return null
}

// ────────────────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────────────────
async function main() {
    const { prisma }    = await import('@/lib/prisma')
    const { kisClient } = await import('@/lib/api/kis-client')

    console.log(`\n${'='.repeat(62)}`)
    console.log(`  repair-snapshot-zero-prices  [${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}]`)
    console.log(`${'='.repeat(62)}`)
    console.log(`DB : ${maskDbUrl(process.env.DATABASE_URL)}`)
    if (TARGET_SNAPSHOT_ID) console.log(`필터: snapshot_id = ${TARGET_SNAPSHOT_ID}`)
    if (TARGET_DATE)        console.log(`필터: date(UTC)   = ${TARGET_DATE}`)
    console.log()

    // ── 1. 대상 snapshot_holdings 조회 ──────────────────────────────────
    const holdingWhere: Record<string, unknown> = { currentPrice: { lte: 0 } }
    if (TARGET_SNAPSHOT_ID) holdingWhere.snapshotId = TARGET_SNAPSHOT_ID

    const zeroHoldings = await prisma.snapshotHolding.findMany({
        where: holdingWhere,
        include: {
            snapshot: {
                select: {
                    id:           true,
                    snapshotDate: true,
                    exchangeRate: true,
                    totalCost:    true,
                },
            },
            stock: {
                select: { stockCode: true, nameKo: true, market: true },
            },
        },
        orderBy: [
            { snapshot: { snapshotDate: 'asc' } },
            { stockCode: 'asc' },
        ],
    })

    // TARGET_DATE 필터 (JS 단 필터 — Timestamptz 비교를 DB 단에서 하면 인덱스 활용이 달라질 수 있음)
    const filtered = TARGET_DATE
        ? zeroHoldings.filter(h => toDateStr(h.snapshot.snapshotDate) === TARGET_DATE)
        : zeroHoldings

    if (filtered.length === 0) {
        console.log('currentPrice <= 0 인 snapshot_holding 이 없습니다. 종료.')
        await prisma.$disconnect()
        return
    }

    // 스냅샷 단위로 그룹핑
    const bySnapshot = new Map<string, {
        snapshotDate: Date
        exchangeRate: { toString(): string }
        holdings: typeof filtered
    }>()

    for (const h of filtered) {
        const key = h.snapshotId
        if (!bySnapshot.has(key)) {
            bySnapshot.set(key, {
                snapshotDate: h.snapshot.snapshotDate,
                exchangeRate: h.snapshot.exchangeRate,
                holdings:     [],
            })
        }
        bySnapshot.get(key)!.holdings.push(h)
    }

    // ── 2. 대상 요약 출력 ───────────────────────────────────────────────
    console.log('대상 요약')
    console.log(`  snapshot_holding 레코드 : ${filtered.length}건`)
    console.log(`  영향 받는 스냅샷        : ${bySnapshot.size}개`)
    console.log()

    for (const [sid, g] of bySnapshot) {
        const dateStr = toDateStr(g.snapshotDate)
        const markets = [...new Set(g.holdings.map(h => h.stock.market ?? '?'))]
        console.log(`  [${dateStr}] ${sid.slice(0, 14)}…  ${g.holdings.length}종목 (${markets.join(', ')})`)
        for (const h of g.holdings) {
            console.log(
                `    · ${h.stockCode.padEnd(8)} ${h.stock.nameKo.slice(0, 16).padEnd(16)}` +
                `  qty=${h.quantity}  avgPrice=${h.averagePrice}  [${h.stock.market}]`
            )
        }
    }
    console.log()

    if (!EXECUTE) {
        console.log('DRY-RUN 모드 — DB 를 수정하지 않았습니다.')
        console.log('실제 반영: npx tsx scripts/repair-snapshot-zero-prices.ts --execute')
        await prisma.$disconnect()
        return
    }

    // ── 3. 스냅샷별 수리 ────────────────────────────────────────────────
    let totalFixed           = 0
    let totalFailed          = 0
    let totalSnapshotsFixed  = 0
    const failedList: string[] = []

    for (const [snapshotId, g] of bySnapshot) {
        const dateStr = toDateStr(g.snapshotDate)
        const usdRate = new Decimal(g.exchangeRate.toString())
        console.log(`\n[${dateStr}] snapshot ${snapshotId.slice(0, 16)}… 수리 시작`)

        // 3-a. 각 종목의 과거 종가 조회 (트랜잭션 밖에서 사전 수집)
        type PriceUpdate = {
            holdingId: string
            stockCode: string
            nameKo: string
            quantity: number
            totalCost: Decimal        // snapshot_holding.totalCost (원본 통화)
            currency: string
            newPrice: number
            usedDate: string
            fallbackDays: number
        }
        const priceUpdates: PriceUpdate[] = []

        for (const h of g.holdings) {
            const market = resolveMarket(h.stock.market)

            if (market === 'LSE') {
                console.log(`  ⊘ ${h.stockCode} (${h.stock.nameKo}) [LSE] — 과거 시세 미지원, 스킵`)
                totalFailed++
                failedList.push(`${h.stockCode}(LSE, ${dateStr})`)
                continue
            }

            process.stdout.write(`  조회 ${h.stockCode} (${h.stock.nameKo}) [${h.stock.market}]… `)

            const result = await fetchHistoricalPrice(kisClient, h.stockCode, market, dateStr)

            if (!result || result.price <= 0) {
                console.log('✗ 가격 조회 실패')
                totalFailed++
                failedList.push(`${h.stockCode}(${dateStr})`)
                continue
            }

            const suffix = result.fallbackDays > 0
                ? ` (${result.fallbackDays}일 소급→${result.usedDate})`
                : ''
            const unit = h.currency === 'USD' ? ' USD' : '원'
            console.log(`✓ ${result.price}${unit}${suffix}`)

            priceUpdates.push({
                holdingId:    h.id,
                stockCode:    h.stockCode,
                nameKo:       h.stock.nameKo,
                quantity:     h.quantity,
                totalCost:    new Decimal(h.totalCost.toString()),
                currency:     h.currency,
                newPrice:     result.price,
                usedDate:     result.usedDate,
                fallbackDays: result.fallbackDays,
            })
        }

        if (priceUpdates.length === 0) {
            console.log('  → 수리 가능한 종목 없음. 스킵.')
            continue
        }

        // 3-b. 트랜잭션: snapshot_holdings 갱신 + portfolio_snapshot 재계산
        try {
            await prisma.$transaction(async (tx) => {
                // 3-b-1. 각 snapshot_holding 갱신
                for (const u of priceUpdates) {
                    const price      = new Decimal(u.newPrice)
                    const qty        = new Decimal(u.quantity)
                    const val        = price.times(qty)
                    const profit     = val.minus(u.totalCost)
                    const profitRate = u.totalCost.isZero()
                        ? new Decimal(0)
                        : profit.div(u.totalCost).times(100)

                    await tx.snapshotHolding.updateMany({
                        where: { id: u.holdingId, currentPrice: { lte: 0 } }, // 이중 가드
                        data: {
                            currentPrice: price.toDecimalPlaces(4).toString(),
                            currentValue: val.toDecimalPlaces(4).toString(),
                            profit:       profit.toDecimalPlaces(4).toString(),
                            profitRate:   profitRate.toDecimalPlaces(4).toString(),
                        },
                    })
                }

                // 3-b-2. 전체 snapshot_holdings 재집계 (업데이트 후 최신값 기준)
                const allHoldings = await tx.snapshotHolding.findMany({
                    where:  { snapshotId },
                    select: { currentValue: true, totalCost: true, currency: true },
                })

                let newTotalValue = new Decimal(0)
                let newTotalCost  = new Decimal(0)

                for (const ah of allHoldings) {
                    const val  = new Decimal(ah.currentValue.toString())
                    const cost = new Decimal(ah.totalCost.toString())
                    // USD 종목은 스냅샷 저장 시점의 환율로 KRW 환산
                    const krwVal  = ah.currency === 'USD' ? val.times(usdRate)  : val
                    const krwCost = ah.currency === 'USD' ? cost.times(usdRate) : cost
                    newTotalValue = newTotalValue.plus(krwVal)
                    newTotalCost  = newTotalCost.plus(krwCost)
                }

                const newTotalProfit = newTotalValue.minus(newTotalCost)
                const newProfitRate  = newTotalCost.isZero()
                    ? new Decimal(0)
                    : newTotalProfit.div(newTotalCost).times(100)

                await tx.portfolioSnapshot.update({
                    where: { id: snapshotId },
                    data: {
                        totalValue:  newTotalValue.toDecimalPlaces(2).toString(),
                        totalProfit: newTotalProfit.toDecimalPlaces(2).toString(),
                        profitRate:  newProfitRate.toDecimalPlaces(4).toString(),
                        // totalCost 는 매입가 기반이므로 변경 불요
                    },
                })

                console.log(
                    `  재계산 → totalValue=${newTotalValue.toFixed(0)}원` +
                    `  totalProfit=${newTotalProfit.toFixed(0)}원` +
                    `  profitRate=${newProfitRate.toFixed(2)}%`
                )
            })

            totalFixed          += priceUpdates.length
            totalSnapshotsFixed += 1
            console.log(`  ✅ ${priceUpdates.length}개 holding + 부모 스냅샷 갱신 완료`)

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`  ❌ 트랜잭션 실패: ${msg}`)
            totalFailed += priceUpdates.length
            failedList.push(...priceUpdates.map(u => `${u.stockCode}(tx-fail, ${dateStr})`))
        }
    }

    // ── 4. 최종 요약 ────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(62)}`)
    console.log(`  수리 완료 요약`)
    console.log(`${'='.repeat(62)}`)
    console.log(`  스냅샷 갱신       : ${totalSnapshotsFixed} / ${bySnapshot.size}개`)
    console.log(`  holding 수리 성공 : ${totalFixed}건`)
    console.log(`  holding 실패/스킵 : ${totalFailed}건`)

    if (failedList.length > 0) {
        console.log(`\n  실패 목록:`)
        for (const f of failedList) console.log(`    - ${f}`)
    }
    console.log()

    await prisma.$disconnect()
}

main().catch((e) => {
    console.error('스크립트 실패:', e)
    process.exit(1)
})
