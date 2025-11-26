'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PortfolioSummaryCard } from '@/components/dashboard/portfolio-summary-card'
import { HoldingsTable } from '@/components/dashboard/holdings-table'
import { snapshotsApi } from '@/lib/api/client'
import { formatDate } from '@/lib/utils/formatters'

interface Snapshot {
  id: string
  snapshotDate: string
  totalValue: string | number
  totalCost: string | number
  totalProfit: string | number
  profitRate: string | number
  cashBalance: string | number
  note?: string
  account: {
    accountName: string
    brokerName: string
  }
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

export default function SnapshotDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function fetchSnapshot() {
      try {
        const response = await snapshotsApi.getDetail(params.id as string)
        if (response.success && response.data) {
          setSnapshot(response.data)
        } else {
          setError(response.error?.message || '스냅샷을 불러오는데 실패했습니다.')
        }
      } catch (err) {
        setError('네트워크 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      fetchSnapshot()
    }
  }, [params.id])

  async function handleDelete() {
    if (!snapshot) return
    if (!confirm('이 스냅샷을 삭제하시겠습니까?')) return

    setDeleting(true)
    try {
      const response = await snapshotsApi.delete(snapshot.id)
      if (response.success) {
        router.push('/dashboard/snapshots')
      } else {
        alert(response.error?.message || '삭제에 실패했습니다.')
      }
    } catch (err) {
      alert('네트워크 오류가 발생했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || '스냅샷을 찾을 수 없습니다.'}</p>
        <Link href="/dashboard/snapshots">
          <Button>목록으로 돌아가기</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex justify-between items-center">
        <div>
          <Link
            href="/dashboard/snapshots"
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
          >
            ← 스냅샷 목록
          </Link>
          <h1 className="text-2xl font-bold">
            스냅샷 상세 - {formatDate(snapshot.snapshotDate)}
          </h1>
          <p className="text-gray-500">
            {snapshot.account.brokerName} ({snapshot.account.accountName})
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? '삭제중...' : '스냅샷 삭제'}
        </Button>
      </div>

      {/* 메모 */}
      {snapshot.note && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <span className="font-medium">메모:</span> {snapshot.note}
          </p>
        </div>
      )}

      {/* 포트폴리오 요약 */}
      <PortfolioSummaryCard
        totalValue={Number(snapshot.totalValue)}
        totalCost={Number(snapshot.totalCost)}
        totalProfit={Number(snapshot.totalProfit)}
        profitRate={Number(snapshot.profitRate)}
        cashBalance={Number(snapshot.cashBalance)}
        holdingsCount={snapshot.holdings.length}
      />

      {/* 보유 종목 */}
      <HoldingsTable
        holdings={snapshot.holdings.map((h) => ({
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
    </div>
  )
}
