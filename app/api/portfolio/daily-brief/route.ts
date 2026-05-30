import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { holdingService } from '@/lib/services/holding-service'
import { cacheGet, stockPriceKey, type PriceCacheEntry } from '@/lib/cache'
import Decimal from 'decimal.js'

// 매일 아침 포트폴리오 브리핑용 read 엔드포인트.
// Claude 원격 루틴이 Bearer 토큰으로 호출 → 보유·등락률·요약 JSON 을 받아
// 종목별 뉴스 조사 + 리밸런싱 분석 후 텔레그램으로 전송한다. (단방향 read)
// 설계: docs/superpowers/specs/2026-05-30-daily-portfolio-brief-design.md
export const dynamic = 'force-dynamic'

// KR 종목은 08:00 KST 에 가격 캐시가 만료돼 getList 가 종목별 라이브 KIS 호출을
// 하므로 cron 라우트와 동일하게 timeout 여유를 둔다. (US 는 캐시 신선)
export const maxDuration = 60

export async function GET(request: NextRequest) {
    // 1. 인증 — 루틴이 Authorization: Bearer ${DAILY_BRIEF_TOKEN} 부착.
    //    토큰·env 는 핸들러 내부에서 읽는다 (Sensitive env 빌드 미복호화 함정 회피).
    const token = process.env.DAILY_BRIEF_TOKEN
    const authHeader = request.headers.get('authorization')
    if (!token || authHeader !== `Bearer ${token}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 대상 사용자 — 개인용이므로 BRIEF_USER_EMAIL 1명만.
    const email = process.env.BRIEF_USER_EMAIL
    if (!email) {
        return NextResponse.json(
            { success: false, error: 'BRIEF_USER_EMAIL not configured' },
            { status: 500 },
        )
    }
    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true },
    })
    if (!user) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // 3. 보유 평가 — 서버측 holdingService.getList 재사용.
    //    currentValue/profit/profitRate/summary 계산 + 가격 캐시(stock:price:{code}) 워밍.
    const result = await holdingService.getList(user.id)
    if (!result.success || !result.data) {
        const message =
            'error' in result && result.error ? result.error.message : 'Failed to load holdings'
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }

    const { holdings, summary } = result.data
    const totalStockValue = new Decimal(summary.totalStockValue || 0)

    // 4. getList 가 버리는 changeRate 를 가격 캐시에서 끌어와 부착 + weight 계산.
    //    - 캐시 미스/비프로덕션(Redis 없음)/시세 실패 → changeRate: null (리포트에서 N/A)
    //    - LSE 는 등락 미산출(캐시값 0 고정)이므로 0 대신 null 로 노출.
    const enriched = await Promise.all(
        holdings.map(async (h) => {
            const entry = await cacheGet<PriceCacheEntry>(stockPriceKey(h.stockCode))
            const changeRate =
                h.market === 'LSE' || !entry || !Number.isFinite(entry.changeRate)
                    ? null
                    : entry.changeRate
            const weight = totalStockValue.isZero()
                ? 0
                : new Decimal(h.currentValue).div(totalStockValue).times(100).toNumber()
            return {
                stockCode: h.stockCode,
                stockName: h.stockName,
                engName: h.engName,
                market: h.market,
                currency: h.currency,
                quantity: h.quantity,
                averagePrice: h.averagePrice,
                currentPrice: h.currentPrice,
                changeRate, // 전일/간밤 대비 등락률(%) — 없으면 null
                totalCost: h.totalCost,
                currentValue: h.currentValue,
                profit: h.profit,
                profitRate: h.profitRate,
                weight,
            }
        }),
    )

    return NextResponse.json({
        success: true,
        asOf: new Date().toISOString(),
        user: { name: user.name ?? null },
        summary: {
            totalCost: summary.totalCost,
            totalValue: summary.totalValue,
            totalStockValue: summary.totalStockValue,
            totalProfit: summary.totalProfit,
            totalProfitRate: summary.totalProfitRate,
            cashBalance: summary.cashBalance,
            exchangeRate: summary.exchangeRate,
            holdingsCount: summary.holdingsCount,
        },
        holdings: enriched,
    })
}
