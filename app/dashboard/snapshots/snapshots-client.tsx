'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    exchangeRate?: number
}

interface SnapshotsClientProps {
    initialSnapshots: Snapshot[]
}

export function SnapshotsClient({ initialSnapshots }: SnapshotsClientProps) {
    const { t, language } = useLanguage()
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6">
                <h1 className="text-xl sm:text-2xl font-bold">{t('snapshotList')}</h1>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Link href="/dashboard/snapshots/new" className="flex-1 sm:flex-none">
                        <Button className="w-full sm:w-auto">{t('newSnapshot')}</Button>
                    </Link>
                </div>
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
                        <div className="bg-white rounded-lg shadow overflow-hidden">
                            {/* Mobile View: Cards */}
                            <div className="md:hidden space-y-4 p-4">
                                {snapshots.map((snapshot) => {
                                    const profit = Number(snapshot.totalProfit)
                                    const isProfit = profit >= 0

                                    // Calculate display values for mobile
                                    let displayValue = Number(snapshot.totalValue)
                                    let displayProfit = profit
                                    let currency = 'KRW'

                                    if (language === 'en' && snapshot.exchangeRate) {
                                        displayValue = displayValue / snapshot.exchangeRate
                                        displayProfit = displayProfit / snapshot.exchangeRate
                                        currency = 'USD'
                                    }

                                    return (
                                        <div key={snapshot.id} className="bg-gray-50 rounded-lg p-4 border space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div className="flex flex-col">
                                                    <Link
                                                        href={`/dashboard/snapshots/${snapshot.id}`}
                                                        className="font-semibold text-blue-600 hover:underline text-lg"
                                                    >
                                                        <span suppressHydrationWarning>{formatDate(snapshot.snapshotDate)}</span>
                                                    </Link>
                                                    <span className="text-sm text-gray-500 mt-1">{snapshot.holdings.length}{t('countUnit')}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Link href={`/dashboard/snapshots/${snapshot.id}`}>
                                                        <Button variant="outline" size="sm" className="h-8 px-2">
                                                            {t('details')}
                                                        </Button>
                                                    </Link>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="h-8 px-2"
                                                        onClick={() => handleDelete(snapshot.id)}
                                                        disabled={deleting === snapshot.id}
                                                    >
                                                        {deleting === snapshot.id ? t('deleting') : t('delete')}
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 pt-2">
                                                <div>
                                                    <div className="text-xs text-gray-500 mb-1">{t('totalValue')}</div>
                                                    <div className="font-medium text-base">{formatCurrency(displayValue, currency)}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-gray-500 mb-1">{t('returnRate')}</div>
                                                    <div className={cn(
                                                        "font-bold text-base",
                                                        isProfit ? 'text-red-600' : 'text-blue-600'
                                                    )}>
                                                        {formatProfitRate(Number(snapshot.profitRate))}
                                                    </div>
                                                </div>
                                                <div className="col-span-2 flex justify-between items-center border-t pt-2 mt-1">
                                                    <span className="text-xs text-gray-500">{t('pl')}</span>
                                                    <span className={cn(
                                                        "font-medium",
                                                        isProfit ? 'text-red-600' : 'text-blue-600'
                                                    )}>
                                                        {formatCurrency(Math.abs(displayProfit), currency)}
                                                    </span>
                                                </div>
                                            </div>

                                            {snapshot.note && (
                                                <div className="text-sm text-gray-600 bg-white p-2 rounded border mt-2">
                                                    {snapshot.note}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Desktop View: Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <div className="min-w-[800px]">
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
                                                const { t, language } = useLanguage()

                                                // Calculate display values
                                                let displayValue = Number(snapshot.totalValue)
                                                let displayProfit = profit
                                                let currency = 'KRW'

                                                if (language === 'en' && snapshot.exchangeRate) {
                                                    displayValue = displayValue / snapshot.exchangeRate
                                                    displayProfit = displayProfit / snapshot.exchangeRate
                                                    currency = 'USD'
                                                }

                                                return (
                                                    <TableRow key={snapshot.id}>
                                                        <TableCell>
                                                            <Link
                                                                href={`/dashboard/snapshots/${snapshot.id}`}
                                                                className="text-blue-600 hover:underline"
                                                            >
                                                                <span suppressHydrationWarning>{formatDate(snapshot.snapshotDate)}</span>
                                                            </Link>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            {formatCurrency(displayValue, currency)}
                                                        </TableCell>
                                                        <TableCell
                                                            className={cn(
                                                                'text-right',
                                                                isProfit ? 'text-red-600' : 'text-blue-600'
                                                            )}
                                                        >
                                                            {formatCurrency(Math.abs(displayProfit), currency)}
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
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
