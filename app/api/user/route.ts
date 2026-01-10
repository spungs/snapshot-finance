import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ratelimit, getIP, checkRateLimit } from '@/lib/ratelimit'

// GET /api/user - 현재 로그인한 사용자 정보 조회
export async function GET(request: NextRequest) {
    try {
        // Rate limiting
        const ip = getIP(request)
        const rateLimitResult = await checkRateLimit(ratelimit.api, ip)

        if (rateLimitResult && !rateLimitResult.success) {
            return NextResponse.json(
                { success: false, error: { code: 'RATE_LIMIT', message: '너무 많은 요청입니다.' } },
                { status: 429 }
            )
        }

        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const userId = session.user.id

        const user = await prisma.user.findUnique({
            where: { id: userId },
        })

        if (!user) {
            return NextResponse.json(
                { success: false, error: { code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.' } },
                { status: 404 }
            )
        }

        // Get snapshot count
        const snapshotCount = await prisma.portfolioSnapshot.count({
            where: { userId: user.id },
        })

        return NextResponse.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                snapshotCount,
                isAutoSnapshotEnabled: user.isAutoSnapshotEnabled,
            },
        })
    } catch (error) {
        console.error('Error fetching user data:', error)
        return NextResponse.json(
            { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
            { status: 500 }
        )
    }
}

// PATCH /api/user - 현재 로그인한 사용자 설정 변경
export async function PATCH(request: NextRequest) {
    try {
        // Rate limiting
        const ip = getIP(request)
        const rateLimitResult = await checkRateLimit(ratelimit.api, ip)

        if (rateLimitResult && !rateLimitResult.success) {
            return NextResponse.json(
                { success: false, error: { code: 'RATE_LIMIT', message: '너무 많은 요청입니다.' } },
                { status: 429 }
            )
        }

        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const userId = session.user.id
        const body = await request.json()
        const { isAutoSnapshotEnabled } = body

        const user = await prisma.user.update({
            where: { id: userId },
            data: { isAutoSnapshotEnabled },
        })

        return NextResponse.json({
            success: true,
            data: { isAutoSnapshotEnabled: user.isAutoSnapshotEnabled }
        })
    } catch (error) {
        console.error('Error updating user settings:', error)
        return NextResponse.json(
            { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
            { status: 500 }
        )
    }
}
