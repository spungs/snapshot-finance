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
            include: {
                securitiesAccounts: true,
            },
        })

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
        }

        // Get snapshot count (assuming single account for MVP)
        const account = user.securitiesAccounts[0]
        let snapshotCount = 0
        let isAutoSnapshotEnabled = false

        if (account) {
            snapshotCount = await prisma.portfolioSnapshot.count({
                where: { accountId: account.id },
            })
            isAutoSnapshotEnabled = account.isAutoSnapshotEnabled
        }

        return NextResponse.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                snapshotCount,
                isAutoSnapshotEnabled,
                accountId: account?.id,
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

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { securitiesAccounts: true },
        })

        if (!user || user.securitiesAccounts.length === 0) {
            return NextResponse.json({ success: false, error: 'User or account not found' }, { status: 404 })
        }

        const account = user.securitiesAccounts[0]

        // Update account
        await prisma.securitiesAccount.update({
            where: { id: account.id },
            data: { isAutoSnapshotEnabled },
        })

        return NextResponse.json({ success: true, data: { isAutoSnapshotEnabled } })
    } catch (error) {
        console.error('Error updating user settings:', error)
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}
