import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { holdingService } from '@/lib/services/holding-service'
import { accountService } from '@/lib/services/account-service'
import { fetchCurrentPrice, detectCurrency } from '@/lib/api/stock-price'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { validateQuantity, validateAveragePrice, validateCurrency } from '@/lib/validation/portfolio-input'
import Decimal from 'decimal.js'

function safeRevalidate() {
    try {
        revalidatePath('/dashboard/portfolio')
        revalidatePath('/dashboard')
    } catch (e) {
        console.warn('[holdings/id] revalidatePath failed (non-critical):', e)
    }
}

// PATCH /api/holdings/[id] - 종목 수정
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const { id } = await params
        const body = await request.json()
        const { quantity, averagePrice, currency, purchaseRate, stockCode, mode = 'merge' } = body

        // 입력값 sanity check (전달된 필드만 검증)
        if (quantity !== undefined) {
            const r = validateQuantity(quantity)
            if (!r.ok) return NextResponse.json(
                { success: false, error: { code: 'INVALID_INPUT', message: r.error } },
                { status: 400 }
            )
        }
        if (averagePrice !== undefined) {
            const r = validateAveragePrice(averagePrice)
            if (!r.ok) return NextResponse.json(
                { success: false, error: { code: 'INVALID_INPUT', message: r.error } },
                { status: 400 }
            )
        }
        if (currency !== undefined) {
            const r = validateCurrency(currency)
            if (!r.ok) return NextResponse.json(
                { success: false, error: { code: 'INVALID_INPUT', message: r.error } },
                { status: 400 }
            )
        }

        // 소유권 확인
        const holding = await prisma.holding.findUnique({
            where: { id },
        })

        if (!holding || holding.userId !== session.user.id) {
            return NextResponse.json(
                { success: false, error: { code: 'NOT_FOUND', message: '보유 종목을 찾을 수 없습니다.' } },
                { status: 404 }
            )
        }

        // ── 티커(종목) 변경 경로 ───────────────────────────────────────────────
        // stockCode 가 전달되고 기존과 다르면 종목 자체를 교체한다.
        // 같은 계좌에 그 종목을 이미 보유 중이면(@@unique([accountId, stockCode]))
        // mode 에 따라 물타기(가중평균 합산)/덮어쓰기 후 현재(수정 중) 행을 삭제해 하나로 합친다.
        if (stockCode && stockCode !== holding.stockCode) {
            const newStock = await prisma.stock.findUnique({ where: { stockCode } })
            if (!newStock) {
                return NextResponse.json(
                    { success: false, error: { code: 'INVALID_INPUT', message: '변경할 종목을 찾을 수 없습니다.' } },
                    { status: 400 }
                )
            }

            // 새 종목 기준 현재가·통화 재조회
            let newCurrentPrice = await fetchCurrentPrice(newStock.stockCode, newStock.market || 'Unknown')
            if (isNaN(newCurrentPrice)) newCurrentPrice = 0
            const newCurrency = currency ?? detectCurrency(newStock.market)
            // KRW 면 1, USD 면 입력된 매입환율 사용. USD 인데 입력이 없으면 현재 환율 적용.
            let newPurchaseRate = 1
            if (newCurrency === 'USD') {
                newPurchaseRate = purchaseRate && purchaseRate > 0 ? purchaseRate : 0
                if (newPurchaseRate <= 0) {
                    const rate = await getUsdExchangeRate()
                    newPurchaseRate = rate > 0 ? rate : 1
                }
            }

            // 입력된 수량/평단 (없으면 기존 값 유지)
            const inQty = quantity ?? holding.quantity
            const inAvg = averagePrice ?? Number(holding.averagePrice)

            // 충돌(같은 계좌 + 새 종목) 보유분 — A 와 다른 행 (A 는 아직 옛 stockCode)
            const conflict = await prisma.holding.findUnique({
                where: { accountId_stockCode: { accountId: holding.accountId, stockCode } },
            })

            let result
            if (conflict) {
                let mergedQty = inQty
                let mergedAvg: Decimal = new Decimal(inAvg)
                if (mode === 'merge') {
                    // 가중평균 평단가 = (기존 매입금액 + 입력 매입금액) / 총 수량 (Decimal — 누적 오차 방지)
                    const oldQty = conflict.quantity
                    const oldAvg = new Decimal(conflict.averagePrice.toString())
                    mergedQty = oldQty + inQty
                    const oldTotal = oldAvg.times(oldQty)
                    const newTotal = new Decimal(inAvg).times(inQty)
                    mergedAvg = mergedQty > 0 ? oldTotal.plus(newTotal).div(mergedQty) : new Decimal(0)
                }
                // 충돌 행 갱신 + 현재(수정 중) 행 삭제 — 단일 트랜잭션으로 원자적 처리
                const [updated] = await prisma.$transaction([
                    prisma.holding.update({
                        where: { id: conflict.id },
                        data: {
                            quantity: mergedQty,
                            averagePrice: mergedAvg,
                            currentPrice: newCurrentPrice || conflict.currentPrice,
                            currency: newCurrency,
                            purchaseRate: newPurchaseRate,
                            priceUpdatedAt: new Date(),
                        },
                        include: { stock: true },
                    }),
                    prisma.holding.delete({ where: { id: holding.id } }),
                ])
                result = updated
            } else {
                // 충돌 없음 — 현재 행의 종목만 교체
                result = await prisma.holding.update({
                    where: { id: holding.id },
                    data: {
                        stockCode,
                        quantity: inQty,
                        averagePrice: inAvg,
                        currentPrice: newCurrentPrice,
                        currency: newCurrency,
                        purchaseRate: newPurchaseRate,
                        priceUpdatedAt: new Date(),
                    },
                    include: { stock: true },
                })
            }

            await holdingService.invalidate(session.user.id)
            await accountService.invalidate(session.user.id).catch((e) => console.warn('[holdings PATCH] accounts invalidate failed:', e))
            safeRevalidate()
            return NextResponse.json({ success: true, data: result })
        }

        // ── 기존 경로: 수량/평단/통화/환율만 수정 ─────────────────────────────
        const updated = await prisma.holding.update({
            where: { id },
            data: {
                ...(quantity !== undefined && { quantity }),
                ...(averagePrice !== undefined && { averagePrice }),
                ...(currency !== undefined && { currency }),
                ...(purchaseRate !== undefined && { purchaseRate }),
            },
            include: { stock: true },
        })

        await holdingService.invalidate(session.user.id)
        // accountId 변경 가능성 + 없어도 holdings 정합성 위해 accounts 캐시 무효화
        await accountService.invalidate(session.user.id).catch((e) => console.warn('[holdings PATCH] accounts invalidate failed:', e))
        safeRevalidate()
        return NextResponse.json({ success: true, data: updated })
    } catch (error) {
        console.error('Holding update error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'UPDATE_FAILED', message: '종목 수정에 실패했습니다.' } },
            { status: 500 }
        )
    }
}

// DELETE /api/holdings/[id] - 종목 삭제
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const { id } = await params

        // 소유권 확인
        const holding = await prisma.holding.findUnique({
            where: { id },
        })

        if (!holding || holding.userId !== session.user.id) {
            return NextResponse.json(
                { success: false, error: { code: 'NOT_FOUND', message: '보유 종목을 찾을 수 없습니다.' } },
                { status: 404 }
            )
        }

        await prisma.holding.delete({ where: { id } })

        await holdingService.invalidate(session.user.id)
        // holdingsCount 감소 → accounts 캐시 무효화
        await accountService.invalidate(session.user.id).catch((e) => console.warn('[holdings DELETE] accounts invalidate failed:', e))
        safeRevalidate()
        return NextResponse.json({ success: true, message: '종목이 삭제되었습니다.' })
    } catch (error) {
        console.error('Holding delete error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'DELETE_FAILED', message: '종목 삭제에 실패했습니다.' } },
            { status: 500 }
        )
    }
}
