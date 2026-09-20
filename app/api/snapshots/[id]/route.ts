import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import { getPortfolioContext } from '@/lib/portfolio-context'
import { snapshotService } from '@/lib/services/snapshot-service'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import {
  validateQuantity,
  validateAveragePrice,
  validateCashAmount,
  validateCashAccounts,
  sumCashAccounts,
} from '@/lib/validation/portfolio-input'
import type { CashAccount } from '@/types/cash'

const MAX_HOLDINGS_PER_SNAPSHOT = 200

// GET /api/snapshots/[id] - 스냅샷 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getPortfolioContext()
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      )
    }

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

    // 스냅샷이 없거나 본인 소유가 아닌 경우
    if (!snapshot || snapshot.userId !== ctx.portfolioUserId) {
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
    const ctx = await getPortfolioContext()
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      )
    }

    const { id } = await params

    // 스냅샷 존재 및 소유권 확인
    const snapshot = await prisma.portfolioSnapshot.findUnique({
      where: { id },
    })

    if (!snapshot || snapshot.userId !== ctx.portfolioUserId) {
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

    // 차트 캐시 무효화
    await snapshotService.invalidateChart(ctx.portfolioUserId)

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
    const ctx = await getPortfolioContext()
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      )
    }

    const { id } = await params

    // 소유권 확인
    const existingSnapshot = await prisma.portfolioSnapshot.findUnique({
      where: { id },
    })

    if (!existingSnapshot || existingSnapshot.userId !== ctx.portfolioUserId) {
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

    const body = await request.json()
    const { holdings, cashBalance, cashAccounts: cashAccountsInput, note, snapshotDate, exchangeRate } = body

    if (!Array.isArray(holdings)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'holdings 배열이 필요합니다.' } },
        { status: 400 }
      )
    }
    if (holdings.length > MAX_HOLDINGS_PER_SNAPSHOT) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: `보유 종목은 최대 ${MAX_HOLDINGS_PER_SNAPSHOT}개까지 허용됩니다.` } },
        { status: 400 }
      )
    }

    // exchangeRate는 양수여야 한다 — Decimal(10,2) 컬럼이라 음수/거대값/NaN 방어
    const fxNum = exchangeRate !== undefined ? Number(exchangeRate) : NaN
    const effectiveExchangeRate = Number.isFinite(fxNum) && fxNum > 0 ? fxNum : FALLBACK_USD_RATE

    // 예수금: cashAccounts 가 있으면 그 합계를 신뢰, 없으면 단일 cashBalance 검증.
    let finalCashBalance: Decimal | null = null
    let finalCashAccounts: CashAccount[] | null = null
    if (cashAccountsInput !== undefined && cashAccountsInput !== null) {
      const accountsCheck = validateCashAccounts(cashAccountsInput)
      if (!accountsCheck.ok) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_INPUT', message: accountsCheck.error } },
          { status: 400 }
        )
      }
      finalCashAccounts = accountsCheck.value.length > 0 ? accountsCheck.value : null
      finalCashBalance = sumCashAccounts(accountsCheck.value)
    } else if (cashBalance !== undefined) {
      const cashCheck = validateCashAmount(cashBalance)
      if (!cashCheck.ok) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_INPUT', message: cashCheck.error } },
          { status: 400 }
        )
      }
      finalCashBalance = new Decimal(cashCheck.value)
    }

    // 1. 종목별 계산 — Decimal로 통일해 부동소수점 오차 제거
    const fxRate = new Decimal(effectiveExchangeRate)
    let totalCost = new Decimal(0)
    let totalValue = new Decimal(0)
    const processedHoldings: Array<{
      stockCode: string
      quantity: number
      averagePrice: Decimal
      currentPrice: Decimal
      totalCost: Decimal
      currentValue: Decimal
      profit: Decimal
      profitRate: Decimal
      currency: string
      purchaseRate: Decimal
    }> = []

    for (const h of holdings as any[]) {
      const qtyCheck = validateQuantity(h.quantity)
      if (!qtyCheck.ok) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_INPUT', message: qtyCheck.error } },
          { status: 400 }
        )
      }
      const avgCheck = validateAveragePrice(h.averagePrice)
      if (!avgCheck.ok) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_INPUT', message: avgCheck.error } },
          { status: 400 }
        )
      }
      // currentPrice는 0 가능(시세 조회 실패 등) — 음수만 차단
      const cpNum = Number(h.currentPrice)
      if (!Number.isFinite(cpNum) || cpNum < 0) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_INPUT', message: 'currentPrice가 올바르지 않습니다.' } },
          { status: 400 }
        )
      }

      const quantity = qtyCheck.value
      const averagePrice = new Decimal(avgCheck.value)
      const currentPrice = new Decimal(cpNum)
      const pRateNum = Number(h.purchaseRate)
      const purchaseRate = Number.isFinite(pRateNum) && pRateNum > 0 ? new Decimal(pRateNum) : new Decimal(1)
      const currency = h.currency === 'USD' ? 'USD' : 'KRW'

      // 종목 행은 **네이티브 통화**로 저장한다 (POST /api/snapshots 와 동일 규약).
      // 화면(snapshot-detail-client)이 currency==='USD' 인 행에 환율을 곱해 원화를 만들기
      // 때문에, 여기서 환산해 저장하면 이중 환산이 되어 금액이 환율배(약 1,400배)로 부푼다.
      const cost = averagePrice.times(quantity)
      const value = currentPrice.times(quantity)
      const profit = value.minus(cost)
      const profitRate = cost.isZero() ? new Decimal(0) : profit.div(cost).times(100)

      // 스냅샷 합계만 KRW 로 환산한다. 매입가는 매입 환율로 동결, 평가가는 스냅샷 환율.
      // purchaseRate 가 1 이면 데이터 누락으로 보고 스냅샷 환율을 쓴다(POST 와 동일).
      const effectivePurchaseRate = purchaseRate.equals(1) ? fxRate : purchaseRate
      const costFx = currency === 'USD' ? effectivePurchaseRate : new Decimal(1)
      const valueFx = currency === 'USD' ? fxRate : new Decimal(1)

      totalCost = totalCost.plus(cost.times(costFx))
      totalValue = totalValue.plus(value.times(valueFx))

      processedHoldings.push({
        stockCode: String((h as { stockCode?: unknown; stockId?: unknown }).stockCode ?? (h as { stockId?: unknown }).stockId),
        quantity,
        averagePrice,
        currentPrice,
        totalCost: cost,        // Native
        currentValue: value,    // Native
        profit,                 // Native
        profitRate,             // Native
        currency,
        purchaseRate,
      })
    }

    const totalProfit = totalValue.minus(totalCost)
    const profitRate = totalCost.isZero() ? new Decimal(0) : totalProfit.div(totalCost).times(100)
    // 위에서 검증된 finalCashBalance 가 null 이면(요청에 누락) 0 으로 fallback.
    const effectiveCashBalance = finalCashBalance ?? new Decimal(0)
    const finalTotalValue = totalValue.plus(effectiveCashBalance)

    // Transaction: Update Snapshot + Replace Holdings
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.portfolioSnapshot.update({
        where: { id },
        data: {
          snapshotDate: snapshotDate ? new Date(snapshotDate) : undefined,
          exchangeRate: new Decimal(effectiveExchangeRate),
          totalValue: finalTotalValue,
          totalCost: totalCost,
          totalProfit: totalProfit,
          profitRate: profitRate,
          cashBalance: effectiveCashBalance,
          // cashAccountsInput 이 명시적으로 전달된 경우에만 갱신.
          // 누락된 요청은 기존 분해 정보를 보존한다 (불변성 친화 + 의도 보호).
          ...(cashAccountsInput !== undefined
            ? {
                cashAccounts: finalCashAccounts
                  ? (finalCashAccounts as unknown as Prisma.InputJsonValue)
                  : Prisma.DbNull,
              }
            : {}),
          note: note,
        },
      })

      await tx.snapshotHolding.deleteMany({ where: { snapshotId: id } })

      if (processedHoldings.length > 0) {
        await tx.snapshotHolding.createMany({
          data: processedHoldings.map(h => ({
            snapshotId: id,
            stockCode: h.stockCode,
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

    // 차트 캐시 무효화
    await snapshotService.invalidateChart(ctx.portfolioUserId)

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
