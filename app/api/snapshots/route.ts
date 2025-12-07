import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateProfitRate, calculateProfit, calculateCurrentValue, calculateTotalCost } from '@/lib/utils/calculations'
import { SUBSCRIPTION_LIMITS } from '@/lib/config/subscription'
import Decimal from 'decimal.js'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { snapshotService } from '@/lib/services/snapshot-service'


// POST /api/snapshots - 스냅샷 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId, holdings, cashBalance, note, snapshotDate } = body

    if (!accountId || !holdings || holdings.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'accountId와 holdings는 필수입니다.',
          },
        },
        { status: 400 }
      )
    }

    // 1. 계좌 및 사용자 플랜 조회
    const account = await prisma.securitiesAccount.findUnique({
      where: { id: accountId },
      include: { user: true },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: { code: 'ACCOUNT_NOT_FOUND', message: '계좌를 찾을 수 없습니다.' } },
        { status: 404 }
      )
    }

    // 2. 현재 스냅샷 개수 조회
    const snapshotCount = await prisma.portfolioSnapshot.count({
      where: { accountId },
    })

    // 3. 플랜별 한도 체크
    const userPlan = account.user.plan as keyof typeof SUBSCRIPTION_LIMITS
    const limit = SUBSCRIPTION_LIMITS[userPlan]

    if (snapshotCount >= limit) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SNAPSHOT_LIMIT_EXCEEDED',
            message: `스냅샷 저장 한도를 초과했습니다. (${userPlan} 플랜: 최대 ${limit}개)`,
            details: { currentCount: snapshotCount, limit, plan: userPlan },
          },
        },
        { status: 403 }
      )
    }

    // 총 매입금액 및 평가금액 계산 (KRW 기준)
    const exchangeRate = await getUsdExchangeRate()
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
        accountId,
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
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const limit = parseInt(searchParams.get('limit') || '20')
    const cursor = searchParams.get('cursor')

    if (!accountId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_ACCOUNT_ID',
            message: 'accountId가 필요합니다.',
          },
        },
        { status: 400 }
      )
    }

    const { data: snapshots, pagination } = await snapshotService.getList(accountId, limit, cursor || undefined)

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
