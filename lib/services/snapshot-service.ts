import { prisma } from '@/lib/prisma'
import { cacheGet, cacheSet, cacheDelete } from '@/lib/cache'

// 홈 PerformanceChart 용 사용자별 캐시.
// - period 필터링은 클라이언트 메모리에서 수행 (모든 기간이 동일 캐시 공유)
// - 변이(create/delete/update)는 invalidateChart() 로 즉시 무효화
// - 따라서 TTL 을 길게 가져가도 안전. cron(일일 스냅샷)은 1시간 TTL 이 자연 처리.
const SNAPSHOTS_CHART_TTL_SECONDS = 3600
const snapshotsChartKey = (userId: string) => `chart:snapshots:${userId}`

export interface ChartDataPoint {
    date: string
    totalValue: number
    totalCost: number
    totalProfit: number
    profitRate: number
    cashBalance: number
    totalAsset: number
}

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

    /**
     * 홈 PerformanceChart 데이터를 Redis 우선으로 조회.
     * 캐시 hit 시 DB 미접근. 모든 period 가 동일 캐시 항목을 공유한다.
     */
    async getChartData(userId: string): Promise<ChartDataPoint[]> {
        const key = snapshotsChartKey(userId)
        const cached = await cacheGet<ChartDataPoint[]>(key)
        if (cached) return cached

        const snapshots = await prisma.portfolioSnapshot.findMany({
            where: { userId },
            orderBy: { snapshotDate: 'asc' },
            select: {
                snapshotDate: true,
                totalValue: true,
                totalCost: true,
                totalProfit: true,
                profitRate: true,
                cashBalance: true,
            },
        })

        const items: ChartDataPoint[] = snapshots.map((s) => ({
            date: s.snapshotDate.toISOString(),
            totalValue: Number(s.totalValue),
            totalCost: Number(s.totalCost),
            totalProfit: Number(s.totalProfit),
            profitRate: Number(s.profitRate),
            cashBalance: Number(s.cashBalance),
            // 총 자산 = 주식 평가액 + 예수금
            totalAsset: Number(s.totalValue) + Number(s.cashBalance),
        }))

        await cacheSet(key, items, SNAPSHOTS_CHART_TTL_SECONDS)
        return items
    },

    /**
     * 스냅샷 변이 직후 호출. 다음 차트 조회는 fresh DB 결과를 받는다.
     */
    async invalidateChart(userId: string) {
        await cacheDelete(snapshotsChartKey(userId))
    },
}
