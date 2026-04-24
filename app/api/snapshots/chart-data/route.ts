import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// GET /api/snapshots/chart-data?period=1M|3M|6M|1Y|ALL
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      )
    }
    const userId = session.user.id

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '3M'

    // 기간별 시작일 계산
    const now = new Date()
    let fromDate: Date | undefined

    switch (period) {
      case '1M':
        fromDate = new Date(now)
        fromDate.setMonth(fromDate.getMonth() - 1)
        break
      case '3M':
        fromDate = new Date(now)
        fromDate.setMonth(fromDate.getMonth() - 3)
        break
      case '6M':
        fromDate = new Date(now)
        fromDate.setMonth(fromDate.getMonth() - 6)
        break
      case '1Y':
        fromDate = new Date(now)
        fromDate.setFullYear(fromDate.getFullYear() - 1)
        break
      case 'ALL':
      default:
        fromDate = undefined
    }

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: {
        userId,
        ...(fromDate && { snapshotDate: { gte: fromDate } }),
      },
      orderBy: { snapshotDate: 'asc' },
      select: {
        id: true,
        snapshotDate: true,
        totalValue: true,
        totalCost: true,
        totalProfit: true,
        profitRate: true,
        cashBalance: true,
        exchangeRate: true,
      },
    })

    const chartData = snapshots.map((s) => ({
      date: s.snapshotDate.toISOString(),
      totalValue: Number(s.totalValue),
      totalCost: Number(s.totalCost),
      totalProfit: Number(s.totalProfit),
      profitRate: Number(s.profitRate),
      cashBalance: Number(s.cashBalance),
      // 총 자산 = 주식 평가액 + 예수금
      totalAsset: Number(s.totalValue) + Number(s.cashBalance),
    }))

    return NextResponse.json({ success: true, data: chartData, period })
  } catch (error) {
    console.error('Chart data fetch error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'CHART_DATA_FETCH_FAILED', message: '차트 데이터 조회에 실패했습니다.' } },
      { status: 500 }
    )
  }
}
