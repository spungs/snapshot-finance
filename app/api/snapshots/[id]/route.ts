import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'

// GET /api/snapshots/[id] - 스냅샷 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const snapshot = await prisma.portfolioSnapshot.findUnique({
      where: { id },
      include: {
        holdings: {
          include: {
            stock: true,
          },
        },
      },
    })

    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SNAPSHOT_NOT_FOUND',
            message: '스냅샷을 찾을 수 없습니다.',
          },
        },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: snapshot })
  } catch (error) {
    console.error('Snapshot detail fetch error:', error)
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

// DELETE /api/snapshots/[id] - 스냅샷 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 스냅샷 존재 여부 확인
    const snapshot = await prisma.portfolioSnapshot.findUnique({
      where: { id },
    })

    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SNAPSHOT_NOT_FOUND',
            message: '스냅샷을 찾을 수 없습니다.',
          },
        },
        { status: 404 }
      )
    }

    // 스냅샷 삭제 (연관된 holdings도 cascade로 자동 삭제)
    await prisma.portfolioSnapshot.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '스냅샷이 삭제되었습니다.',
    })
  } catch (error) {
    console.error('Snapshot delete error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_DELETE_FAILED',
          message: '스냅샷 삭제에 실패했습니다.',
        },
      },
      { status: 500 }
    )
  }
}

// PUT /api/snapshots/[id] - 스냅샷 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { holdings, cashBalance, note, snapshotDate, exchangeRate } = body

    // 1. Calculate totals
    let totalCost = 0
    let totalValue = 0

    const effectiveExchangeRate = exchangeRate ? Number(exchangeRate) : 1435

    const processedHoldings = holdings.map((h: any) => {
      const qty = Number(h.quantity)
      const averagePrice = Number(h.averagePrice)
      const currentPrice = Number(h.currentPrice)
      const pRate = Number(h.purchaseRate) || 1
      const currency = h.currency || 'KRW'

      // Cost calculation
      const holdingCost = qty * averagePrice * pRate

      // Value calculation
      // If USD, apply effective exchange rate
      const cRate = currency === 'USD' ? effectiveExchangeRate : 1
      const holdingValue = qty * currentPrice * cRate

      const profit = holdingValue - holdingCost
      const profitRate = holdingCost > 0 ? (profit / holdingCost) * 100 : 0

      totalCost += holdingCost
      totalValue += holdingValue

      return {
        stockId: h.stockId,
        quantity: qty,
        averagePrice: averagePrice,
        currentPrice: currentPrice,
        totalCost: holdingCost,
        currentValue: holdingValue,
        profit: profit,
        profitRate: profitRate,
        currency: currency,
        purchaseRate: pRate,
      }
    })

    // Re-calculating totals
    const totalProfit = totalValue - totalCost
    const profitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0
    const finalCashBalance = Number(cashBalance) || 0
    const finalTotalValue = totalValue + finalCashBalance

    // Transaction: Update Snapshot + Replace Holdings
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Update Snapshot
      await tx.portfolioSnapshot.update({
        where: { id },
        data: {
          snapshotDate: snapshotDate ? new Date(snapshotDate) : undefined,
          exchangeRate: new Decimal(effectiveExchangeRate),
          totalValue: finalTotalValue,
          totalCost: totalCost,
          totalProfit: totalProfit,
          profitRate: profitRate,
          cashBalance: finalCashBalance,
          note: note,
        },
      })

      // 2. Delete existing holdings
      await tx.stockHolding.deleteMany({
        where: { snapshotId: id },
      })

      // 3. Create new holdings
      if (processedHoldings.length > 0) {
        await tx.stockHolding.createMany({
          data: processedHoldings.map((h: any) => ({
            snapshotId: id,
            stockId: h.stockId,
            quantity: h.quantity,
            averagePrice: h.averagePrice,
            currentPrice: h.currentPrice,
            totalCost: h.totalCost,
            currentValue: h.currentValue,
            profit: h.profit,
            profitRate: h.profitRate,
            currency: h.currency,
            purchaseRate: h.purchaseRate,
          })),
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: '스냅샷이 수정되었습니다.',
    })
  } catch (error) {
    console.error('Snapshot update error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_UPDATE_FAILED',
          message: '스냅샷 수정에 실패했습니다.',
        },
      },
      { status: 500 }
    )
  }
}
