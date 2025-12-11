import { prisma } from '@/lib/prisma'

export const snapshotService = {
    async getList(userId: string, limit: number = 20, cursor?: string) {
        const snapshots = await prisma.portfolioSnapshot.findMany({
            where: { userId },
            orderBy: { snapshotDate: 'desc' },
            take: limit + 1,
            ...(cursor && {
                cursor: { id: cursor },
                skip: 1,
            }),
            include: {
                holdings: {
                    include: {
                        stock: true,
                    },
                },
            },
        })

        const hasMore = snapshots.length > limit
        const data = hasMore ? snapshots.slice(0, -1) : snapshots
        const nextCursor = hasMore ? data[data.length - 1]?.id : undefined

        return {
            success: true,
            data,
            pagination: {
                cursor: nextCursor,
                hasMore,
            },
        }
    },

    async getDetail(id: string) {
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

        if (!snapshot) return null

        return snapshot
    },
}
