import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateProfitRate, calculateProfit, calculateCurrentValue, calculateTotalCost } from '@/lib/utils/calculations'

import Decimal from 'decimal.js'
import { getUsdExchangeRate, FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import { snapshotService } from '@/lib/services/snapshot-service'
import { auth } from '@/lib/auth'
import { validateQuantity, validateAveragePrice, validateCashAmount } from '@/lib/validation/portfolio-input'

const MAX_HOLDINGS_PER_SNAPSHOT = 200


// POST /api/snapshots - 스냅샷 생성
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
    const { holdings, cashBalance, note, snapshotDate, exchangeRate: providedExchangeRate } = body

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'holdings는 필수입니다.',
          },
        },
        { status: 400 }
      )
    }
    if (holdings.length > MAX_HOLDINGS_PER_SNAPSHOT) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: `보유 종목은 최대 ${MAX_HOLDINGS_PER_SNAPSHOT}개까지 허용됩니다.`,
          },
        },
        { status: 400 }
      )
    }

    if (cashBalance !== undefined) {
      const cashCheck = validateCashAmount(cashBalance)
      if (!cashCheck.ok) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_REQUEST', message: cashCheck.error } },
          { status: 400 }
        )
      }
    }

    // 환율은 양수만 허용 — Decimal(10,2) 컬럼 한도 + 0/음수/NaN 방어
    let exchangeRate: number
    if (providedExchangeRate !== undefined) {
      const fxNum = Number(providedExchangeRate)
      if (!Number.isFinite(fxNum) || fxNum <= 0 || fxNum > 100_000) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_REQUEST', message: '환율이 올바르지 않습니다.' } },
          { status: 400 }
        )
      }
      exchangeRate = fxNum
    } else {
      exchangeRate = await getUsdExchangeRate()
    }

    let totalCost = new Decimal(0)
    let totalValue = new Decimal(0)

    // 종목별 입력 검증 — 잘못된 값은 400으로 즉시 반환
    const validatedHoldings: Array<{ raw: any; qty: number; avg: number; cp: number }> = []
    for (const h of holdings as any[]) {
      const qty = validateQuantity(h.quantity)
      if (!qty.ok) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_REQUEST', message: qty.error } },
          { status: 400 }
        )
      }
      const avg = validateAveragePrice(h.averagePrice)
      if (!avg.ok) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_REQUEST', message: avg.error } },
          { status: 400 }
        )
      }
      const cpNum = Number(h.currentPrice)
      if (!Number.isFinite(cpNum) || cpNum < 0) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_REQUEST', message: 'currentPrice가 올바르지 않습니다.' } },
          { status: 400 }
        )
      }
      if (typeof h.stockId !== 'string' || !h.stockId) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_REQUEST', message: 'stockId가 누락되었습니다.' } },
          { status: 400 }
        )
      }
      validatedHoldings.push({ raw: h, qty: qty.value, avg: avg.value, cp: cpNum })
    }

    const holdingsData = validatedHoldings.map(({ raw: h, qty, avg, cp }) => {
      const quantity = qty
      const averagePrice = new Decimal(avg)
      const currentPrice = new Decimal(cp)
      const currency = h.currency === 'USD' ? 'USD' : 'KRW'
      const pRateNum = Number(h.purchaseRate)
      const purchaseRate = Number.isFinite(pRateNum) && pRateNum > 0 ? new Decimal(pRateNum) : new Decimal(1)

      // 개별 종목 계산 (Native Currency 기준)
      const cost = averagePrice.times(quantity)
      const value = currentPrice.times(quantity)
      const profit = value.minus(cost)
      const profitRate = cost.isZero() ? new Decimal(0) : profit.div(cost).times(100)

      // 스냅샷 전체 합계 계산 (KRW 환산)
      let costKRW = cost
      let valueKRW = value

      if (currency === 'USD') {
        // purchaseRate가 1이면(데이터 누락 추정) 현재 환율을 사용하여 원화 환산 (터무니없는 수익률 방지)
        const effectivePurchaseRate = purchaseRate.equals(1) ? new Decimal(exchangeRate || FALLBACK_USD_RATE) : purchaseRate
        costKRW = cost.times(effectivePurchaseRate)
        valueKRW = value.times(exchangeRate || FALLBACK_USD_RATE) // Fallback rate if fetch fails
      }

      totalCost = totalCost.plus(costKRW)
      totalValue = totalValue.plus(valueKRW)

      return {
        stockId: h.stockId,
        quantity,
        averagePrice,
        currentPrice,
        totalCost: cost, // Native
        currentValue: value, // Native
        profit, // Native
        profitRate,
        currency,
        purchaseRate,
      }
    })

    // 전체 수익 및 수익률 (KRW 기준)
    const totalProfit = totalValue.minus(totalCost)
    const profitRate = totalCost.isZero() ? new Decimal(0) : totalProfit.div(totalCost).times(100)

    // 트랜잭션으로 스냅샷 + 보유종목 저장
    const snapshot = await prisma.portfolioSnapshot.create({
      data: {
        user: { connect: { id: userId } },
        snapshotDate: snapshotDate ? new Date(snapshotDate) : undefined,
        totalValue,
        totalCost,
        totalProfit,
        profitRate,
        cashBalance: new Decimal(cashBalance || 0),
        exchangeRate: new Decimal(exchangeRate || FALLBACK_USD_RATE),
        note,
        holdings: {
          create: holdingsData,
        },
      },
      include: {
        holdings: {
          include: {
            stock: true,
          },
        },
      },
    })

    // 차트 캐시 무효화 — 다음 홈 진입에서 fresh DB 결과 반영
    await snapshotService.invalidateChart(userId)

    return NextResponse.json({ success: true, data: snapshot }, { status: 201 })
  } catch (error) {
    console.error('Snapshot creation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_CREATE_FAILED',
          message: '스냅샷 생성에 실패했습니다.',
          details: error instanceof Error ? error.message : error,
        },
      },
      { status: 500 }
    )
  }
}

// GET /api/snapshots - 스냅샷 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      )
    }
    const userId = session.user.id

    const { searchParams } = new URL(request.url)
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10)
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 20
    const cursor = searchParams.get('cursor')

    const { data: snapshots, pagination } = await snapshotService.getList(userId, limit, cursor || undefined)

    return NextResponse.json({
      success: true,
      data: snapshots,
      pagination,
    })
  } catch (error) {
    console.error('Snapshot fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_FETCH_FAILED',
          message: '스냅샷 조회에 실패했습니다.',
        },
      },
      { status: 500 }
    )
  }
}
