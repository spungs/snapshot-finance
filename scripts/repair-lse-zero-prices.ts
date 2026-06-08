/**
 * scripts/repair-lse-zero-prices.ts
 *
 * LSE 종목(TSL3 / HIM3)의 snapshot_holdings.currentPrice = 0 데이터를
 * 웹서칭으로 확보한 과거 종가(USD)로 복구하고, 부모 portfolio_snapshot 의
 * totalValue / totalProfit / profitRate 를 daily-snapshot 과 동일한 식으로 재계산한다.
 *
 * 배경:
 *   repair-snapshot-zero-prices.ts 는 LSE 과거 시세를 자동 조회하지 못해 SKIP 한다
 *   (KIS 미지원, stooq 과거 CSV 는 PoW/API-key 차단). 그래서 LSE 8건은 수동 복구.
 *
 * 단위:
 *   대상 holdings 는 currency='USD' (LSE 의 USD-표시 라인). averagePrice/totalCost 모두 USD.
 *   → currentPrice 도 USD 로 저장. holding 행의 currentValue/profit 은 원통화(USD) 기준.
 *
 * 부모 재계산 — daily-snapshot/route.ts 와 동일하게:
 *   - totalValue : USD holding 은 snapshot.exchangeRate 로 KRW 환산
 *   - totalCost  : USD holding 은 holding.purchaseRate(매입환율)로 동결 환산
 *                  (purchaseRate 누락/legacy(1) → exchangeRate 로 폴백)
 *   - totalProfit = totalValue − totalCost,  profitRate = totalProfit / totalCost × 100
 *   ※ 이전 버전이 totalCost 를 exchangeRate 로 환산해 profitRate 가 과소 계산되던 버그를 교정.
 *
 * 종가 출처 (런던 종가, USD):
 *   TSL3  06-03=14.51  06-04=13.65  06-05=12.00   (stockanalysis.com + stockinvest.us 교차확인)
 *   HIM3  06-03=77.87* 06-04=77.87  06-05=56.77
 *           - 06-04: 앱 live Holding 실측(stooq, 2026-06-04 21:36 UTC priceUpdatedAt)
 *           - 06-05: AJ Bell 'previous close'(2026-06-08 조회 = 06-05 금요일 종가)
 *           - * 06-03: 실측 미확보 → 인접 거래일 06-04 대체(기초자산 HIMS 가 6/2~6/4 보합세)
 *
 * 실행:
 *   npx tsx scripts/repair-lse-zero-prices.ts             # dry-run (기본)
 *   npx tsx scripts/repair-lse-zero-prices.ts --execute   # 실제 DB 수정
 *
 * 멱등성/안전장치:
 *   - dry-run 기본. --execute 없으면 무수정.
 *   - holding 가격은 PRICE_BY_DATE 기준으로 결정적 → 재실행해도 같은 값.
 *   - 재계산 totalCost 가 기존 stored totalCost 와 크게 어긋나면 경고만(저장은 stored 기준).
 *   - 스냅샷 단위 트랜잭션.
 */

import path from 'path'
import dotenv from 'dotenv'
import Decimal from 'decimal.js'

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })

const EXECUTE = process.argv.includes('--execute')

/** 날짜(YYYY-MM-DD, UTC) × 종목 → 런던 종가(USD). */
const PRICE_BY_DATE: Record<string, Record<string, number>> = {
    '2026-06-03': { TSL3: 14.51, HIM3: 77.87 },
    '2026-06-04': { TSL3: 13.65, HIM3: 77.87 },
    '2026-06-05': { TSL3: 12.0,  HIM3: 56.77 },
}

const LSE_CODES = ['TSL3', 'HIM3']

function toDateStr(d: Date): string {
    return d.toISOString().split('T')[0]
}
function maskDbUrl(url?: string): string {
    if (!url) return '(DATABASE_URL 없음)'
    return url.replace(/:\/\/([^:/@]+):[^@]+@/, '://$1:****@')
}

/** daily-snapshot 의 effectivePurchaseRate 와 동일: 누락/legacy(1) 면 exchangeRate 로 폴백. */
function effectivePurchaseRate(purchaseRate: Decimal, exchangeRate: Decimal): Decimal {
    return purchaseRate.gt(0) && !purchaseRate.equals(1) ? purchaseRate : exchangeRate
}

async function main() {
    const { prisma } = await import('@/lib/prisma')

    console.log(`\n${'='.repeat(62)}`)
    console.log(`  repair-lse-zero-prices  [${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}]`)
    console.log(`${'='.repeat(62)}`)
    console.log(`DB : ${maskDbUrl(process.env.DATABASE_URL)}\n`)

    // ── 1. 대상 LSE holdings → 영향 스냅샷 집합 ─────────────────────────────
    const lseHoldings = await prisma.snapshotHolding.findMany({
        where: { stockCode: { in: LSE_CODES }, stock: { market: 'LSE' } },
        include: {
            snapshot: { select: { id: true, snapshotDate: true, exchangeRate: true, totalCost: true, totalValue: true, profitRate: true } },
            stock: { select: { stockCode: true, market: true } },
        },
        orderBy: [{ snapshot: { snapshotDate: 'asc' } }, { stockCode: 'asc' }],
    })

    // PRICE_BY_DATE 에 날짜가 있는 스냅샷만 (이번 복구 대상)
    const bySnapshot = new Map<string, {
        date: string; exchangeRate: Decimal
        totalCostBefore: Decimal; totalValueBefore: Decimal; profitRateBefore: Decimal
        holdings: typeof lseHoldings
    }>()
    for (const h of lseHoldings) {
        const date = toDateStr(h.snapshot.snapshotDate)
        if (!PRICE_BY_DATE[date]) continue
        if (!bySnapshot.has(h.snapshotId)) {
            bySnapshot.set(h.snapshotId, {
                date,
                exchangeRate: new Decimal(h.snapshot.exchangeRate.toString()),
                totalCostBefore: new Decimal(h.snapshot.totalCost.toString()),
                totalValueBefore: new Decimal(h.snapshot.totalValue.toString()),
                profitRateBefore: new Decimal(h.snapshot.profitRate.toString()),
                holdings: [] as typeof lseHoldings,
            })
        }
        bySnapshot.get(h.snapshotId)!.holdings.push(h)
    }

    if (bySnapshot.size === 0) {
        console.log('복구 대상 스냅샷이 없습니다. 종료.')
        await prisma.$disconnect()
        return
    }
    console.log(`대상: 스냅샷 ${bySnapshot.size}개 / LSE holding ${[...bySnapshot.values()].reduce((n, g) => n + g.holdings.length, 0)}건\n`)

    let fixedSnapshots = 0
    let fixedHoldings = 0

    for (const [snapshotId, g] of bySnapshot) {
        const map = PRICE_BY_DATE[g.date]
        console.log(`[${g.date}] ${snapshotId.slice(0, 16)}…  exRate=${g.exchangeRate}`)

        // 가격 매핑 검증
        for (const h of g.holdings) {
            const px = map[h.stockCode]
            if (px === undefined || px <= 0) {
                console.error(`   ✗ 가격 없음: ${g.date} ${h.stockCode} — 중단`)
                await prisma.$disconnect()
                process.exit(1)
            }
            const note = g.date === '2026-06-03' && h.stockCode === 'HIM3' ? '  (인접일 대체)' : ''
            console.log(`   · ${h.stockCode.padEnd(5)} qty=${h.quantity} avg=${h.averagePrice} → close=${px} USD${note}`)
        }

        if (!EXECUTE) continue

        await prisma.$transaction(async (tx) => {
            // 2-a. LSE holding 갱신 (멱등 — 결정적 값으로 set)
            for (const h of g.holdings) {
                const price = new Decimal(map[h.stockCode])
                const qty = new Decimal(h.quantity)
                const totalCost = new Decimal(h.totalCost.toString()) // 원통화(USD)
                const val = price.times(qty)
                const profit = val.minus(totalCost)
                const profitRate = totalCost.isZero() ? new Decimal(0) : profit.div(totalCost).times(100)

                await tx.snapshotHolding.update({
                    where: { id: h.id },
                    data: {
                        currentPrice: price.toDecimalPlaces(2).toString(),
                        currentValue: val.toDecimalPlaces(2).toString(),
                        profit: profit.toDecimalPlaces(2).toString(),
                        profitRate: profitRate.toDecimalPlaces(4).toString(),
                    },
                })
            }

            // 2-b. 부모 재집계 — daily-snapshot 식 (value=exchangeRate, cost=purchaseRate)
            const allHoldings = await tx.snapshotHolding.findMany({
                where: { snapshotId },
                select: { currentValue: true, totalCost: true, currency: true, purchaseRate: true },
            })

            let recomputedValue = new Decimal(0)
            let recomputedCost = new Decimal(0)
            for (const ah of allHoldings) {
                const val = new Decimal(ah.currentValue.toString())
                const cost = new Decimal(ah.totalCost.toString())
                const pr = new Decimal(ah.purchaseRate.toString())
                const krwVal = ah.currency === 'USD' ? val.times(g.exchangeRate) : val
                const krwCost = ah.currency === 'USD' ? cost.times(effectivePurchaseRate(pr, g.exchangeRate)) : cost
                recomputedValue = recomputedValue.plus(krwVal)
                recomputedCost = recomputedCost.plus(krwCost)
            }

            // totalCost 정합성: 재계산 cost 가 stored 와 크게 다르면 경고 (저장은 stored 유지)
            const costDiff = recomputedCost.minus(g.totalCostBefore).abs()
            if (costDiff.gt(g.totalCostBefore.times(0.001))) {
                console.warn(`   ⚠ totalCost 재계산(${recomputedCost.toFixed(0)}) ≠ stored(${g.totalCostBefore.toFixed(0)}), diff ${costDiff.toFixed(0)} — stored 유지`)
            }

            const totalCost = g.totalCostBefore // 매입원가 — purchaseRate 동결값 유지
            const totalProfit = recomputedValue.minus(totalCost)
            const profitRate = totalCost.isZero() ? new Decimal(0) : totalProfit.div(totalCost).times(100)

            await tx.portfolioSnapshot.update({
                where: { id: snapshotId },
                data: {
                    totalValue: recomputedValue.toDecimalPlaces(2).toString(),
                    totalProfit: totalProfit.toDecimalPlaces(2).toString(),
                    profitRate: profitRate.toDecimalPlaces(4).toString(),
                    // totalCost 변경 없음
                },
            })

            console.log(
                `   재계산: totalValue ${g.totalValueBefore.toFixed(0)} → ${recomputedValue.toFixed(0)}원` +
                `   profitRate ${g.profitRateBefore.toFixed(2)} → ${profitRate.toFixed(2)}%  (cost ${totalCost.toFixed(0)} 고정)`
            )
            fixedSnapshots++
            fixedHoldings += g.holdings.length
        })
    }

    console.log(`\n${'='.repeat(62)}`)
    if (EXECUTE) console.log(`  ✅ 완료: 스냅샷 ${fixedSnapshots}개 / LSE holding ${fixedHoldings}건`)
    else console.log(`  DRY-RUN — DB 무수정. 실제 반영: --execute`)
    console.log(`${'='.repeat(62)}\n`)

    await prisma.$disconnect()
}

main().catch((e) => {
    console.error('스크립트 실패:', e)
    process.exit(1)
})
