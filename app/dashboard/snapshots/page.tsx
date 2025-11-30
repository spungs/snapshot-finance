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

import { useLanguage } from '@/lib/i18n/context'

export default function SnapshotsPage() {
  const { t } = useLanguage()
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
        setError(response.error?.message || t('loadFailed'))
      }
    } catch (err) {
      setError(t('networkError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSnapshots()
  }, [])

  async function handleDelete(id: string) {
    if (!confirm(t('confirmDelete'))) return

    setDeleting(id)
    try {
      const response = await snapshotsApi.delete(id)
      if (response.success) {
        setSnapshots((prev) => prev.filter((s) => s.id !== id))
      } else {
        alert(response.error?.message || t('deleteFailed'))
      }
    } catch (err) {
      alert(t('networkError'))
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
        <Button onClick={() => fetchSnapshots()}>{t('retry')}</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('snapshotList')}</h1>
        <Link href="/dashboard/snapshots/new">
          <Button>{t('newSnapshot')}</Button>
        </Link>
      </div>

      {snapshots.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 mb-4">{t('noSnapshots')}</p>
            <Link href="/dashboard/snapshots/new">
              <Button>{t('createFirstSnapshot')}</Button>
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
                    <TableHead>{t('date')}</TableHead>
                    <TableHead className="text-right">{t('totalValue')}</TableHead>
                    <TableHead className="text-right">{t('pl')}</TableHead>
                    <TableHead className="text-right">{t('returnRate')}</TableHead>
                    <TableHead className="text-right">{t('holdingsCount')}</TableHead>
                    <TableHead>{t('memo')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
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
                          {snapshot.holdings.length}{t('countUnit')}
                        </TableCell>
                        <TableCell className="text-gray-500 max-w-[200px] truncate">
                          {snapshot.note || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/dashboard/snapshots/${snapshot.id}`}>
                              <Button variant="outline" size="sm">
                                {t('details')}
                              </Button>
                            </Link>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(snapshot.id)}
                              disabled={deleting === snapshot.id}
                            >
                              {deleting === snapshot.id ? t('deleting') : t('delete')}
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
