'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PortfolioSummaryCard } from '@/components/dashboard/portfolio-summary-card'
import { ProfitChart } from '@/components/dashboard/profit-chart'
import { HoldingsTable } from '@/components/dashboard/holdings-table'
import { snapshotsApi } from '@/lib/api/client'
import { formatDate } from '@/lib/utils/formatters'

// 테스트용 계좌 ID (Phase 1)
const TEST_ACCOUNT_ID = 'test-account-1'

interface Snapshot {
  id: string
  snapshotDate: string
  totalValue: string | number
  totalCost: string | number
  totalProfit: string | number
  profitRate: string | number
  cashBalance: string | number
  holdings: Array<{
    id: string
    stock: {
      stockCode: string
      stockName: string
    }
    quantity: number
    averagePrice: string | number
    currentPrice: string | number
    totalCost: string | number
    currentValue: string | number
    profit: string | number
    profitRate: string | number
  }>
}

export default function DashboardPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSnapshots() {
      try {
        const response = await snapshotsApi.getList(TEST_ACCOUNT_ID)
        if (response.success && response.data) {
          setSnapshots(response.data)
        } else {
          setError(response.error?.message || '스냅샷을 불러오는데 실패했습니다.')
        }
      } catch (err) {
        setError('네트워크 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    fetchSnapshots()
  }, [])

  const latestSnapshot = snapshots[0]

  // 차트 데이터 변환 (최신 순 -> 오래된 순)
  const chartData = [...snapshots]
    .reverse()
    .map((s) => ({
      date: s.snapshotDate,
      profitRate: Number(s.profitRate),
      totalValue: Number(s.totalValue),
    }))

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>다시 시도</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <Link href="/dashboard/snapshots/new">
          <Button>새 스냅샷 생성</Button>
        </Link>
      </div>

      {snapshots.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <p className="text-gray-500 mb-4">아직 저장된 스냅샷이 없습니다.</p>
          <Link href="/dashboard/snapshots/new">
            <Button>첫 스냅샷 생성하기</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* 포트폴리오 요약 */}
          {latestSnapshot && (
            <PortfolioSummaryCard
              totalValue={Number(latestSnapshot.totalValue)}
              totalCost={Number(latestSnapshot.totalCost)}
              totalProfit={Number(latestSnapshot.totalProfit)}
              profitRate={Number(latestSnapshot.profitRate)}
              cashBalance={Number(latestSnapshot.cashBalance)}
              holdingsCount={latestSnapshot.holdings.length}
              snapshotDate={formatDate(latestSnapshot.snapshotDate)}
            />
          )}

          {/* 수익률 차트 */}
          <ProfitChart data={chartData} />

          {/* 보유 종목 */}
          {latestSnapshot && (
            <HoldingsTable
              holdings={latestSnapshot.holdings.map((h) => ({
                ...h,
                quantity: Number(h.quantity),
                averagePrice: Number(h.averagePrice),
                currentPrice: Number(h.currentPrice),
                totalCost: Number(h.totalCost),
                currentValue: Number(h.currentValue),
                profit: Number(h.profit),
                profitRate: Number(h.profitRate),
              }))}
            />
          )}

          {/* 최근 스냅샷 목록으로 이동 */}
          <div className="text-center">
            <Link href="/dashboard/snapshots">
              <Button variant="outline">전체 스냅샷 보기</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
