import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { assertHoldingOwnership, assertAccountOwnership } from '@/lib/auth-helpers'
import { holdingService } from '@/lib/services/holding-service'
import Decimal from 'decimal.js'

function safeRevalidate() {
    try {
        revalidatePath('/dashboard/portfolio')
        revalidatePath('/dashboard')
    } catch (e) {
        console.warn('[holdings/transfer] revalidatePath failed (non-critical):', e)
    }
}

// POST /api/holdings/[id]/transfer
// body: { toAccountId: string, quantity: number }
// 원본 계좌 → 대상 계좌로 일부/전체 이체. 대상에 동일 종목 있으면 가중평균 merge.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json(
            { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
            { status: 401 }
        )
    }
    const userId = session.user.id
    const { id: holdingId } = await params

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { success: false, error: { code: 'INVALID_INPUT', message: '요청 본문 파싱 실패' } },
            { status: 400 }
        )
    }

    const toAccountId = typeof body?.toAccountId === 'string' ? body.toAccountId : null
    const rawQty = Number(body?.quantity)
    const transferQty = Number.isFinite(rawQty) ? Math.trunc(rawQty) : NaN

    if (!toAccountId || !Number.isFinite(transferQty) || transferQty <= 0) {
        return NextResponse.json(
            { success: false, error: { code: 'INVALID_INPUT', message: '대상 계좌와 1 이상의 수량이 필요합니다.' } },
            { status: 400 }
        )
    }

    // IDOR — 원본 holding
    const source = await assertHoldingOwnership(holdingId, userId)
    if (!source) {
        return NextResponse.json(
            { success: false, error: { code: 'NOT_FOUND', message: '종목을 찾을 수 없습니다.' } },
            { status: 404 }
        )
    }
    if (source.accountId === toAccountId) {
        return NextResponse.json(
            { success: false, error: { code: 'SAME_ACCOUNT', message: '같은 계좌로는 이체할 수 없습니다.' } },
            { status: 400 }
        )
    }

    // IDOR — 대상 계좌
    const targetAccount = await assertAccountOwnership(toAccountId, userId)
    if (!targetAccount) {
        return NextResponse.json(
            { success: false, error: { code: 'TARGET_ACCOUNT_NOT_FOUND', message: '대상 계좌를 찾을 수 없습니다.' } },
            { status: 404 }
        )
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const src = await tx.holding.findUnique({
                where: { id: holdingId },
                select: {
                    id: true, quantity: true, averagePrice: true, purchaseRate: true,
                    currency: true, currentPrice: true, stockId: true, priceUpdatedAt: true,
                },
            })
            if (!src) throw new Error('SOURCE_NOT_FOUND')

            const sourceQty = src.quantity
            if (transferQty > sourceQty) {
                throw new Error('INSUFFICIENT_QUANTITY')
            }

            const remainingQty = sourceQty - transferQty

            // 원본: 0 이면 삭제, 아니면 수량만 차감 (평단가/환율/현재가 보존)
            if (remainingQty === 0) {
                await tx.holding.delete({ where: { id: src.id } })
            } else {
                await tx.holding.update({
                    where: { id: src.id },
                    data: { quantity: remainingQty },
                })
            }

            // 대상: 같은 종목 있으면 merge, 없으면 새 row
            const dest = await tx.holding.findUnique({
                where: { accountId_stockId: { accountId: toAccountId, stockId: src.stockId } },
            })

            if (dest) {
                const destQty = new Decimal(dest.quantity)
                const xferQty = new Decimal(transferQty)
                const newQty = destQty.plus(xferQty)
                const newAvg = new Decimal(dest.averagePrice.toString()).times(destQty)
                    .plus(new Decimal(src.averagePrice.toString()).times(xferQty))
                    .div(newQty)

                const updateData: {
                    quantity: number
                    averagePrice: string
                    purchaseRate?: string
                } = {
                    quantity: newQty.toNumber(),
                    averagePrice: newAvg.toFixed(2),
                }

                // USD 종목은 매입환율도 가중평균 (양쪽 모두 의미있는 값일 때만)
                if (src.currency === 'USD') {
                    const srcRate = new Decimal(src.purchaseRate.toString())
                    const destRate = new Decimal(dest.purchaseRate.toString())
                    if (srcRate.gt(1) && destRate.gt(1)) {
                        const newRate = destRate.times(destQty)
                            .plus(srcRate.times(xferQty))
                            .div(newQty)
                        updateData.purchaseRate = newRate.toFixed(2)
                    } else if (srcRate.gt(1) && destRate.lte(1)) {
                        // dest 가 기본값이면 src 환율 채택
                        updateData.purchaseRate = srcRate.toFixed(2)
                    }
                    // 그 외 (src 가 기본값이거나 둘 다 기본값) → dest 환율 유지
                }

                await tx.holding.update({
                    where: { id: dest.id },
                    data: updateData,
                })
                return { merged: true, destHoldingId: dest.id }
            }

            const created = await tx.holding.create({
                data: {
                    userId,
                    accountId: toAccountId,
                    stockId: src.stockId,
                    quantity: transferQty,
                    averagePrice: src.averagePrice,
                    purchaseRate: src.purchaseRate,
                    currency: src.currency,
                    currentPrice: src.currentPrice,
                    priceUpdatedAt: src.priceUpdatedAt,
                },
            })
            return { merged: false, destHoldingId: created.id }
        })

        // L2 캐시 (Upstash) 무효화
        await holdingService.invalidate(userId).catch((e) =>
            console.warn('[holdings/transfer] cache invalidate failed:', e)
        )
        safeRevalidate()

        return NextResponse.json({ success: true, data: result })
    } catch (error: any) {
        if (error?.message === 'INSUFFICIENT_QUANTITY') {
            return NextResponse.json(
                { success: false, error: { code: 'INSUFFICIENT_QUANTITY', message: '이체 수량이 보유 수량을 초과합니다.' } },
                { status: 400 }
            )
        }
        console.error('[holdings/transfer] error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'TRANSFER_FAILED', message: '이체에 실패했습니다.' } },
            { status: 500 }
        )
    }
}
