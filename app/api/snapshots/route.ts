import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateProfitRate, calculateProfit, calculateCurrentValue, calculateTotalCost } from '@/lib/utils/calculations'

import Decimal from 'decimal.js'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { snapshotService } from '@/lib/services/snapshot-service'
import { auth } from '@/lib/auth'


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

    if (!holdings || holdings.length === 0) {
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

    // 총 매입금액 및 평가금액 계산 (KRW 기준)
    const exchangeRate = providedExchangeRate ? Number(providedExchangeRate) : await getUsdExchangeRate()
    let totalCost = new Decimal(0)
    let totalValue = new Decimal(0)

    const holdingsData = holdings.map((h: any) => {
      const quantity = h.quantity
      const averagePrice = new Decimal(h.averagePrice)
      const currentPrice = new Decimal(h.currentPrice)
      const currency = h.currency || 'KRW'
      const purchaseRate = new Decimal(h.purchaseRate || 1)

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
        const effectivePurchaseRate = purchaseRate.equals(1) ? new Decimal(exchangeRate || 1400) : purchaseRate
        costKRW = cost.times(effectivePurchaseRate)
        valueKRW = value.times(exchangeRate || 1400) // Fallback rate if fetch fails
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
        exchangeRate: new Decimal(exchangeRate || 1435),
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
    const limit = parseInt(searchParams.get('limit') || '20')
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
