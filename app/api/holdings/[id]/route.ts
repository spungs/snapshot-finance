import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { holdingService } from '@/lib/services/holding-service'
import { accountService } from '@/lib/services/account-service'
import { validateQuantity, validateAveragePrice, validateCurrency } from '@/lib/validation/portfolio-input'

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
        const { quantity, averagePrice, currency, purchaseRate } = body

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
