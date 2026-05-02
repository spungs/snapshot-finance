import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { holdingService } from '@/lib/services/holding-service'

export async function PUT(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { items } = body // Expected: [{ id: "holdingId", order: 0 }, { id: "holdingId", order: 1 }, ...]

        if (!items || !Array.isArray(items)) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_INPUT', message: '유효하지 않은 데이터입니다.' } },
                { status: 400 }
            )
        }

        // Transaction for batch update
        await prisma.$transaction(
            items.map((item: any) =>
                prisma.holding.update({
                    where: {
                        id: item.id,
                        userId: session.user!.id // Security check: Ensure user owns the holding
                    },
                    data: { displayOrder: item.order },
                })
            )
        )

        holdingService.invalidate(session.user.id)
        return NextResponse.json({ success: true, message: '순서가 저장되었습니다.' })
    } catch (error) {
        console.error('Holding reorder error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'REORDER_FAILED', message: '순서 저장에 실패했습니다.' } },
            { status: 500 }
        )
    }
}
