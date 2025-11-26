'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { snapshotsApi } from '@/lib/api/client'
import { formatCurrency, formatDate, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

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
    stock: { stockName: string }
  }>
  note?: string
}

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function fetchSnapshots() {
    try {
      setLoading(true)
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

  useEffect(() => {
    fetchSnapshots()
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('이 스냅샷을 삭제하시겠습니까?')) return

    setDeleting(id)
    try {
      const response = await snapshotsApi.delete(id)
      if (response.success) {
        setSnapshots((prev) => prev.filter((s) => s.id !== id))
      } else {
        alert(response.error?.message || '삭제에 실패했습니다.')
      }
    } catch (err) {
      alert('네트워크 오류가 발생했습니다.')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={() => fetchSnapshots()}>다시 시도</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">스냅샷 목록</h1>
        <Link href="/dashboard/snapshots/new">
          <Button>새 스냅샷 생성</Button>
        </Link>
      </div>

      {snapshots.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 mb-4">아직 저장된 스냅샷이 없습니다.</p>
            <Link href="/dashboard/snapshots/new">
              <Button>첫 스냅샷 생성하기</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead className="text-right">평가금액</TableHead>
                    <TableHead className="text-right">손익</TableHead>
                    <TableHead className="text-right">수익률</TableHead>
                    <TableHead className="text-right">종목수</TableHead>
                    <TableHead>메모</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((snapshot) => {
                    const profit = Number(snapshot.totalProfit)
                    const isProfit = profit >= 0

                    return (
                      <TableRow key={snapshot.id}>
                        <TableCell>
                          <Link
                            href={`/dashboard/snapshots/${snapshot.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {formatDate(snapshot.snapshotDate)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(Number(snapshot.totalValue))}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            isProfit ? 'text-red-600' : 'text-blue-600'
                          )}
                        >
                          {isProfit ? '+' : ''}
                          {formatCurrency(profit)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-bold',
                            isProfit ? 'text-red-600' : 'text-blue-600'
                          )}
                        >
                          {formatProfitRate(Number(snapshot.profitRate))}
                        </TableCell>
                        <TableCell className="text-right">
                          {snapshot.holdings.length}개
                        </TableCell>
                        <TableCell className="text-gray-500 max-w-[200px] truncate">
                          {snapshot.note || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/dashboard/snapshots/${snapshot.id}`}>
                              <Button variant="outline" size="sm">
                                상세
                              </Button>
                            </Link>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(snapshot.id)}
                              disabled={deleting === snapshot.id}
                            >
                              {deleting === snapshot.id ? '삭제중...' : '삭제'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
