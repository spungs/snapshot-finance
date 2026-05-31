/**
 * scripts/repair-zero-prices.ts
 *
 * 운영 DB 수리 스크립트 — currentPrice <= 0 인 보유 종목(holdings)의 현재가를
 * 기존 fetchCurrentPrice(= KIS 클라이언트)로 다시 조회해 채운다.
 *
 * 실행 (별칭 `@/` 해석을 위해 tsx 사용 — worker:dev 와 동일한 이유):
 *   npx tsx scripts/repair-zero-prices.ts            # dry-run (기본, DB 수정 없음)
 *   npx tsx scripts/repair-zero-prices.ts --execute  # 실제 업데이트
 *
 * 안전장치:
 *   - dry-run 이 기본. --execute 플래그가 있어야만 DB 를 변경한다.
 *   - .env(운영 Supabase) 를 명시적으로 로드한다.
 *   - dry-run 은 KIS 를 호출하지 않고 대상 목록만 출력한다 (쿼터 절약).
 *   - updateMany 의 WHERE 에도 currentPrice <= 0 가드를 둬서, 양수 현재가를 가진
 *     기존 레코드는 절대 덮어쓰지 않는다.
 *   - 종목 간 200ms 딜레이로 KIS rate limit 을 회피한다.
 *
 * 참고: 일반 실행 시 NODE_ENV 가 'production' 이 아니므로 lib/cache 의 Redis 가
 *       비활성(fail-open) → kis-client 가 캐시를 건너뛰고 KIS API 를 직접 호출하며,
 *       운영 Redis 캐시를 오염시키지 않는다.
 */
import path from 'path'
import dotenv from 'dotenv'

// @/lib/prisma, @/lib/api/kis-client 가 모듈 평가 시점에 DATABASE_URL / KIS_* 를 읽으므로,
// 그 전에 운영 env 를 로드해야 한다. 따라서 무거운 import 는 모두 dotenv 이후 동적 import.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })

const EXECUTE = process.argv.includes('--execute')
const DELAY_MS = 200

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function maskDbUrl(url?: string): string {
    if (!url) return '(DATABASE_URL 없음)'
    // postgresql://user:password@host... → 비밀번호만 마스킹
    return url.replace(/:\/\/([^:/@]+):[^@]+@/, '://$1:****@')
}

async function main() {
    const { prisma } = await import('@/lib/prisma')
    const { fetchCurrentPrice } = await import('@/lib/api/stock-price')

    console.log(`\n=== repair-zero-prices (${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}) ===`)
    console.log(`DB: ${maskDbUrl(process.env.DATABASE_URL)}\n`)

    // 1) currentPrice <= 0 인 holdings 조회 (스키마상 not-null @default(0) → 사실상 0)
    const zeroHoldings = await prisma.holding.findMany({
        where: { currentPrice: { lte: 0 } },
        include: { stock: true },
    })

    if (zeroHoldings.length === 0) {
        console.log('currentPrice <= 0 인 보유 종목이 없습니다. 종료.')
        await prisma.$disconnect()
        return
    }

    // 2) ticker(stockCode) 기준 중복 제거 (같은 종목이 여러 유저/계좌에 걸쳐 있을 수 있음)
    const byTicker = new Map<
        string,
        { market: string; nameKo: string; holdingCount: number }
    >()
    for (const h of zeroHoldings) {
        const cur = byTicker.get(h.stockCode)
        if (cur) {
            cur.holdingCount += 1
        } else {
            byTicker.set(h.stockCode, {
                market: h.stock.market,
                nameKo: h.stock.nameKo,
                holdingCount: 1,
            })
        }
    }

    const tickers = [...byTicker.entries()]
    console.log(
        `대상: 보유 레코드 ${zeroHoldings.length}건 / 고유 종목 ${tickers.length}개\n`,
    )
    for (const [code, info] of tickers) {
        console.log(
            `  - ${code} (${info.nameKo}) [${info.market}] · 레코드 ${info.holdingCount}건`,
        )
    }
    console.log('')

    if (!EXECUTE) {
        console.log('DRY-RUN 모드 — DB 를 수정하지 않았습니다.')
        console.log('실제 반영: npx tsx scripts/repair-zero-prices.ts --execute')
        await prisma.$disconnect()
        return
    }

    // 3) 종목별 현재가 조회 후 업데이트 (--execute 일 때만)
    let success = 0
    let failed = 0
    let rowsUpdated = 0
    const failures: string[] = []

    for (const [code, info] of tickers) {
        // fetchCurrentPrice 는 조회 실패 시 내부에서 0 을 반환한다.
        const price = await fetchCurrentPrice(code, info.market)

        if (!(price > 0)) {
            failed++
            failures.push(`${code}(${info.nameKo})`)
            console.log(`  ✗ ${code} (${info.nameKo}) — 가격 조회 실패/0, 스킵`)
            await sleep(DELAY_MS)
            continue
        }

        // 양수 가격만, 그리고 currentPrice <= 0 인 레코드에만 반영.
        // (양수 현재가를 가진 기존 레코드는 WHERE 가드로 절대 건드리지 않음)
        const res = await prisma.holding.updateMany({
            where: { stockCode: code, currentPrice: { lte: 0 } },
            data: { currentPrice: price, priceUpdatedAt: new Date() },
        })
        success++
        rowsUpdated += res.count
        console.log(
            `  ✓ ${code} (${info.nameKo}) — ${price} · ${res.count}건 업데이트`,
        )
        await sleep(DELAY_MS)
    }

    console.log('\n=== 요약 ===')
    console.log(`고유 종목 대상: ${tickers.length}`)
    console.log(`성공: ${success} / 실패(스킵): ${failed}`)
    console.log(`업데이트된 holdings 레코드: ${rowsUpdated}건`)
    if (failures.length) {
        console.log(`실패 종목: ${failures.join(', ')}`)
    }

    await prisma.$disconnect()
}

main().catch((e) => {
    console.error('스크립트 실패:', e)
    process.exit(1)
})
