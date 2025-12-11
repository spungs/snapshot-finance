import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'


// Test user ID for Phase 1/2 (until auth is implemented)
// We will use the 'free' user by default for testing, but we should probably make this dynamic or mockable.
// For now, let's assume the client sends a userId or we pick a default test user.
// Since we don't have real auth, we'll look for a query param or header, or default to 'test-user-free'.
// BUT, the dashboard is currently using 'test-account-1' which belongs to 'test-user-free'.
// Let's try to infer from the account if possible, or just hardcode for MVP testing.
// Actually, let's allow passing 'userId' in query param for testing different users.

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId') || 'test-user-free' // Default to Free user

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        })

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
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
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json()
        const { userId, isAutoSnapshotEnabled } = body

        if (!userId) {
            return NextResponse.json({ success: false, error: 'UserId is required' }, { status: 400 })
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { isAutoSnapshotEnabled },
        })

        return NextResponse.json({ success: true, data: { isAutoSnapshotEnabled: user.isAutoSnapshotEnabled } })
    } catch (error) {
        console.error('Error updating user settings:', error)
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}
