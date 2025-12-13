import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    try {
        // Authenticate request (Vercel Cron)
        const authHeader = request.headers.get('authorization')
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        // Find and delete expired soft-deleted users
        const deletedUsers = await prisma.user.deleteMany({
            where: {
                deletedAt: {
                    lt: thirtyDaysAgo,
                },
            },
        })

        return NextResponse.json({
            success: true,
            deletedCount: deletedUsers.count,
        })
    } catch (error) {
        console.error('Failed to delete expired users:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
