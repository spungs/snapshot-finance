'use client'


import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Play } from 'lucide-react'
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
import { useLanguage } from '@/lib/i18n/context'

interface Snapshot {
    id: string
    snapshotDate: string | Date // Adjusted for serialization
    totalValue: string | number | any // Adjusted for Decimal
    totalCost: string | number | any
    totalProfit: string | number | any
    profitRate: string | number | any
    cashBalance: string | number | any
    holdings: Array<{
        id: string
        stock: { stockName: string }
    }>
    note?: string | null
}

interface SnapshotsClientProps {
    initialSnapshots: Snapshot[]
}

export function SnapshotsClient({ initialSnapshots }: SnapshotsClientProps) {
    const { t } = useLanguage()
    const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots)
    const [deleting, setDeleting] = useState<string | null>(null)

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
                                        <TableHead className="text-center">{t('simulation')}</TableHead>
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
                                                    {formatCurrency(Math.abs(profit))}
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
                                                <TableCell className="text-center">
                                                    <Link href={`/dashboard/simulation?snapshotId=${snapshot.id}`}>
                                                        <Button variant="secondary" size="sm">
                                                            <Play className="h-4 w-4 min-w-4" />
                                                        </Button>
                                                    </Link>
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
