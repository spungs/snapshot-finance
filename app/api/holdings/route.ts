import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { holdingService } from '@/lib/services/holding-service'
import { kisClient } from '@/lib/api/kis-client'


// 현재가 조회 헬퍼 함수 (KIS API 사용)
async function fetchCurrentPrice(stockCode: string, market: string): Promise<number> {
    try {
        // 시장 타입 매핑 (US, KOSPI, KOSDAQ)
        let marketType: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI'
        if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS') {
            marketType = 'US'
        } else if (market === 'KOSDAQ' || market === 'KQ') {
            marketType = 'KOSDAQ'
        }

        const priceData = await kisClient.getCurrentPrice(stockCode, marketType)
        return priceData.price
    } catch (e) {
        console.error(`Failed to fetch price for ${stockCode}:`, e)
        return 0
    }
}


// GET /api/holdings - 현재 잔고 조회 (저장된 현재가 사용)
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const result = await holdingService.getList(session.user.id)

        if (!result.success) {
            return NextResponse.json(result, { status: 500 })
        }

        return NextResponse.json(result)
    } catch (error) {
        console.error('Holdings fetch error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'FETCH_FAILED', message: '잔고 조회에 실패했습니다.' } },
            { status: 500 }
        )
    }
}

// POST /api/holdings - 종목 추가 (현재가 조회 후 저장)
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const userId = session.user.id

        const body = await request.json()
        const { stockId, quantity, averagePrice, mode = 'overwrite' } = body
        let { purchaseRate, currency } = body
        if (!purchaseRate) purchaseRate = 1

        if (!stockId || !quantity || !averagePrice) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_INPUT', message: '필수 필드가 누락되었습니다.' } },
                { status: 400 }
            )
        }

        let account = await prisma.securitiesAccount.findFirst({
            where: { userId },
        })

        // 계좌가 없으면 자동 생성
        if (!account) {
            account = await prisma.securitiesAccount.create({
                data: {
                    userId,
                    accountNumber: 'default',
                    accountName: '기본 계좌',
                    brokerName: 'Manual',
                    apiType: 'manual',
                },
            })
        }

        // 현재가 조회
        const stock = await prisma.stock.findUnique({ where: { id: stockId } })
        let currentPrice = 0
        if (stock) {
            currentPrice = await fetchCurrentPrice(stock.stockCode, stock.market)
            if (isNaN(currentPrice)) currentPrice = 0

            // 통화 자동 감지 (입력된 통화가 없으면 시장 정보로 판단)
            if (!currency) {
                const usMarkets = ['US', 'NAS', 'NYS', 'AMS']
                currency = usMarkets.includes(stock.market) ? 'USD' : 'KRW'
            }

            // USD인데 purchaseRate가 1(기본값)인 경우 현재 환율 적용
            if (currency === 'USD' && purchaseRate === 1) {
                const rate = await getUsdExchangeRate()
                if (rate > 0) purchaseRate = rate
            }
        } else {
            // 종목을 찾을 수 없는 경우 기본값
            if (!currency) currency = 'KRW'
        }

        let holding

        // 물타기 모드이고 기존 보유분이 있을 경우 처리
        if (mode === 'merge') {
            const existing = await prisma.holding.findUnique({
                where: {
                    accountId_stockId: {
                        accountId: account.id,
                        stockId,
                    },
                },
            })

            if (existing) {
                const oldQty = existing.quantity
                const oldAvg = Number(existing.averagePrice)
                const newQty = oldQty + quantity
                // 가중평균 평단가 계산
                const newAvg = ((oldQty * oldAvg) + (quantity * averagePrice)) / newQty

                holding = await prisma.holding.update({
                    where: { id: existing.id },
                    data: {
                        quantity: newQty,
                        averagePrice: newAvg,
                        currentPrice: currentPrice || existing.currentPrice,
                        currency,
                        purchaseRate,
                        priceUpdatedAt: new Date(),
                    },
                    include: { stock: true },
                })
            }
        }

        // holding이 처리되지 않았으면(덮어쓰기 모드이거나, 물타기 모드인데 신규 종목인 경우) upsert 수행
        if (!holding) {
            holding = await prisma.holding.upsert({
                where: {
                    accountId_stockId: {
                        accountId: account.id,
                        stockId,
                    },
                },
                update: {
                    quantity,
                    averagePrice,
                    currentPrice,
                    currency,
                    purchaseRate,
                    priceUpdatedAt: new Date(),
                },
                create: {
                    account: { connect: { id: account.id } },
                    stock: { connect: { id: stockId } },
                    quantity,
                    averagePrice,
                    currentPrice,
                    currency,
                    purchaseRate,
                    priceUpdatedAt: new Date(),
                },
                include: { stock: true },
            })
        }

        return NextResponse.json({ success: true, data: holding })
    } catch (error) {
        console.error('Holding create error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'CREATE_FAILED', message: '종목 추가에 실패했습니다.' } },
            { status: 500 }
        )
    }
}
