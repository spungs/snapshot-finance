import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateProfitRate, calculateProfit, calculateCurrentValue, calculateTotalCost } from '@/lib/utils/calculations'
import { SUBSCRIPTION_LIMITS } from '@/lib/config/subscription'
import Decimal from 'decimal.js'

// POST /api/snapshots - 스냅샷 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId, holdings, cashBalance, note } = body

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

    // 총 매입금액 및 평가금액 계산
    let totalCost = new Decimal(0)
    let totalValue = new Decimal(0)

    const holdingsData = holdings.map((h: any) => {
      const cost = calculateTotalCost(h.quantity, h.averagePrice)
      const value = calculateCurrentValue(h.quantity, h.currentPrice)
      const profit = calculateProfit(value, cost)
      const profitRate = calculateProfitRate(value, cost)

      totalCost = totalCost.plus(cost)
      totalValue = totalValue.plus(value)

      return {
        stockId: h.stockId,
        quantity: h.quantity,
        averagePrice: new Decimal(h.averagePrice),
        currentPrice: new Decimal(h.currentPrice),
        totalCost: cost,
        currentValue: value,
        profit: profit,
        profitRate: profitRate,
        currency: h.currency || 'KRW',
        purchaseRate: new Decimal(h.purchaseRate || 1),
      }
    })

    const totalProfit = calculateProfit(totalValue, totalCost)
    const profitRate = calculateProfitRate(totalValue, totalCost)

    // 트랜잭션으로 스냅샷 + 보유종목 저장
    const snapshot = await prisma.portfolioSnapshot.create({
      data: {
        accountId,
        totalValue,
        totalCost,
        totalProfit,
        profitRate,
        cashBalance: new Decimal(cashBalance || 0),
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

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: { accountId },
      orderBy: { snapshotDate: 'desc' },
      take: limit + 1, // 다음 페이지 확인용으로 1개 더 조회
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      include: {
        holdings: {
          include: {
            stock: true,
          },
        },
      },
    })

    const hasMore = snapshots.length > limit
    const data = hasMore ? snapshots.slice(0, -1) : snapshots
    const nextCursor = hasMore ? data[data.length - 1]?.id : undefined

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        cursor: nextCursor,
        hasMore,
      },
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
