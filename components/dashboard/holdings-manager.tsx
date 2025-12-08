'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { holdingsApi, snapshotsApi } from '@/lib/api/client'
import { formatCurrency, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { Skeleton } from '@/components/ui/skeleton'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { Plus, Trash2, Camera, Edit2, Check, X, Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'

interface Holding {
    id: string
    stockId: string
    stockCode: string
    stockName: string
    market: string
    quantity: number
    averagePrice: number
    currentPrice: number
    currency: string
    purchaseRate: number
    totalCost: number
    currentValue: number
    profit: number
    profitRate: number
}

interface Summary {
    totalCost: number
    totalValue: number
    totalProfit: number
    totalProfitRate: number
    holdingsCount: number
    exchangeRate?: number
}

interface Props {
    accountId?: string
    initialData?: {
        holdings: Holding[]
        summary: Summary
    }
}

export function HoldingsManager({ accountId, initialData }: Props) {
    const { t } = useLanguage()
    const [holdings, setHoldings] = useState<Holding[]>(initialData?.holdings || [])
    const [summary, setSummary] = useState<Summary | null>(initialData?.summary || null)
    const [loading, setLoading] = useState(!initialData)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [savingSnapshot, setSavingSnapshot] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [savingRowId, setSavingRowId] = useState<string | null>(null)
    const [editValues, setEditValues] = useState<{ quantity: string; averagePrice: string }>({
        quantity: '',
        averagePrice: '',
    })

    // 새 종목 추가 상태
    const [newStock, setNewStock] = useState<{
        id: string
        stockCode: string
        stockName: string
        market?: string
    } | null>(null)
    const [newQuantity, setNewQuantity] = useState('')
    const [newAveragePrice, setNewAveragePrice] = useState('')
    const [isMerge, setIsMerge] = useState(false)

    const parseNumericValue = (value: string) => {
        return value.replace(/,/g, '')
    }

    const fetchHoldings = useCallback(async () => {
        try {
            // 초기 로딩이 아닐 때만 refreshing 표시
            if (holdings.length > 0) setIsRefreshing(true)

            const response = await holdingsApi.getList()
            if (response.success && response.data) {
                setHoldings(response.data.holdings)
                setSummary(response.data.summary)
            } else {
                setError(response.error?.message || '잔고 조회 실패')
            }
        } catch (err) {
            setError('네트워크 오류')
        } finally {
            setLoading(false)
            setIsRefreshing(false)
        }
    }, [holdings.length])

    useEffect(() => {
        if (!initialData) {
            fetchHoldings()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleAddHolding = async () => {
        if (!newStock || !newQuantity || !newAveragePrice) return

        setAdding(true)
        try {
            const response = await holdingsApi.create({
                stockId: newStock.id,
                quantity: parseInt(parseNumericValue(newQuantity)),
                averagePrice: parseFloat(parseNumericValue(newAveragePrice)),
                mode: isMerge ? 'merge' : 'overwrite',
            })
            if (response.success) {
                setNewStock(null)
                setNewQuantity('')
                setNewAveragePrice('')
                fetchHoldings()
            } else {
                alert(response.error?.message || '종목 추가 실패')
            }
        } catch (err) {
            alert('네트워크 오류')
        } finally {
            setAdding(false)
        }
    }

    const handleDeleteHolding = async (id: string) => {
        if (!confirm('이 종목을 삭제하시겠습니까?')) return

        try {
            const response = await holdingsApi.delete(id)
            if (response.success) {
                fetchHoldings()
            } else {
                alert(response.error?.message || '삭제 실패')
            }
        } catch (err) {
            alert('네트워크 오류')
        }
    }

    const handleStartEdit = (holding: Holding) => {
        setEditingId(holding.id)
        setEditValues({
            quantity: holding.quantity.toString(),
            averagePrice: holding.averagePrice.toString(),
        })
    }

    const handleCancelEdit = () => {
        setEditingId(null)
        setEditValues({ quantity: '', averagePrice: '' })
    }

    const handleSaveEdit = async (id: string) => {
        if (savingRowId) return
        setSavingRowId(id)
        try {
            const response = await holdingsApi.update(id, {
                quantity: parseInt(editValues.quantity),
                averagePrice: parseFloat(editValues.averagePrice),
            })
            if (response.success) {
                setEditingId(null)
                fetchHoldings()
            } else {
                alert(response.error?.message || '수정 실패')
            }
        } catch (err) {
            alert('네트워크 오류')
        } finally {
            setSavingRowId(null)
        }
    }

    const handleSaveSnapshot = async () => {
        if (holdings.length === 0) {
            alert('저장할 잔고가 없습니다.')
            return
        }

        setSavingSnapshot(true)
        try {
            const response = await snapshotsApi.create({
                accountId: accountId || 'test-account-1',
                holdings: holdings.map((h) => ({
                    stockId: h.stockId,
                    quantity: h.quantity,
                    averagePrice: h.averagePrice,
                    currentPrice: h.currentPrice,
                    currency: h.currency,
                    purchaseRate: h.purchaseRate,
                })),
                cashBalance: 0,
                note: `스냅샷 - ${new Date().toLocaleDateString('ko-KR')}`,
            })
            if (response.success) {
                alert('스냅샷이 저장되었습니다!')
            } else {
                alert(response.error?.message || '스냅샷 저장 실패')
            }
        } catch (err) {
            alert('네트워크 오류')
        } finally {
            setSavingSnapshot(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        )
    }

    if (error) {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <p className="text-red-500 mb-4">{error}</p>
                    <Button onClick={() => fetchHoldings()}>다시 시도</Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {/* 요약 카드 */}
            {summary && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{t('portfolioSummary')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">{t('totalValue')}</p>
                                <p className="text-2xl font-bold">{formatCurrency(summary.totalValue)}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{t('totalCost')}</p>
                                <p className="text-lg font-medium">{formatCurrency(summary.totalCost)}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{t('pl')}</p>
                                <p
                                    className={cn(
                                        'text-2xl font-bold',
                                        summary.totalProfit >= 0 ? 'text-red-600' : 'text-blue-600'
                                    )}
                                >
                                    {formatCurrency(Math.abs(summary.totalProfit))}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{t('returnRate')}</p>
                                <p
                                    className={cn(
                                        'text-2xl font-bold',
                                        summary.totalProfitRate >= 0 ? 'text-red-600' : 'text-blue-600'
                                    )}
                                >
                                    {formatProfitRate(summary.totalProfitRate)}
                                </p>
                            </div>
                        </div>
                        {summary.exchangeRate && (
                            <div className="mt-4 pt-4 border-t text-sm text-right text-muted-foreground">
                                적용 환율: 1 USD = {formatCurrency(summary.exchangeRate, 'KRW')}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* 종목 추가 */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        {t('addStock')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <StockSearchCombobox
                                value={newStock?.stockName || ''}
                                onSelect={(stock) => setNewStock(stock)}
                                disabled={adding}
                            />
                        </div>
                        <div className="w-full sm:w-32">
                            <FormattedNumberInput
                                placeholder={t('quantity')}
                                value={newQuantity}
                                onChange={setNewQuantity}
                                disabled={adding}
                            />
                        </div>
                        <div className="w-full sm:w-40">
                            <FormattedNumberInput
                                placeholder={t('averagePrice')}
                                value={newAveragePrice}
                                onChange={setNewAveragePrice}
                                disabled={adding}
                            />
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="merge-mode"
                                checked={isMerge}
                                onCheckedChange={setIsMerge}
                                disabled={adding}
                            />
                            <Label htmlFor="merge-mode" className="whitespace-nowrap">
                                물타기
                            </Label>
                        </div>
                        <Button
                            onClick={handleAddHolding}
                            disabled={!newStock || !newQuantity || !newAveragePrice || adding}
                        >
                            {adding ? '추가 중...' : t('add')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 잔고 테이블 */}
            <Card className="relative overflow-hidden">
                {(isRefreshing || savingSnapshot) && (
                    <div className="absolute top-0 left-0 w-full z-10">
                        <Progress value={undefined} className="h-1 w-full rounded-none" />
                    </div>
                )}
                <CardHeader className="pb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                    <CardTitle className="text-lg">{t('holdings')} ({holdings.length})</CardTitle>
                    <Button
                        onClick={handleSaveSnapshot}
                        disabled={savingSnapshot || holdings.length === 0 || isRefreshing}
                        className="flex items-center gap-2 w-full sm:w-auto"
                    >
                        <Camera className="w-4 h-4" />
                        {savingSnapshot ? '저장 중...' : t('saveSnapshot')}
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <div className={cn("transition-opacity duration-200", (isRefreshing || savingSnapshot) && "opacity-60 pointer-events-none")}>
                        {holdings.length === 0 ? (
                            <div className="py-12 text-center text-muted-foreground">
                                보유 종목이 없습니다. 위에서 종목을 추가해주세요.
                            </div>
                        ) : (
                            <div className="overflow-x-auto -mx-4 sm:mx-0">
                                <div className="min-w-[700px] px-4 sm:px-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t('stockName')}</TableHead>
                                                <TableHead className="text-right">{t('quantity')}</TableHead>
                                                <TableHead className="text-right">{t('averagePrice')}</TableHead>
                                                <TableHead className="text-right">{t('currentPrice')}</TableHead>
                                                <TableHead className="text-right">{t('totalCost')}</TableHead>
                                                <TableHead className="text-right">{t('evaluatedValue')}</TableHead>
                                                <TableHead className="text-right">{t('pl')}</TableHead>
                                                <TableHead className="text-right">{t('returnRate')}</TableHead>
                                                <TableHead className="text-right">{t('actions')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {holdings.map((holding) => {
                                                const isProfit = holding.profit >= 0
                                                const isEditing = editingId === holding.id

                                                return (
                                                    <TableRow key={holding.id}>
                                                        <TableCell>
                                                            <div>
                                                                <p className="font-medium">{holding.stockName}</p>
                                                                <p className="text-sm text-muted-foreground">{holding.stockCode}</p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {isEditing ? (
                                                                <FormattedNumberInput
                                                                    value={editValues.quantity}
                                                                    onChange={(val) =>
                                                                        setEditValues((prev) => ({ ...prev, quantity: val }))
                                                                    }
                                                                    className="w-20 text-right"
                                                                    disabled={isRefreshing || savingSnapshot}
                                                                />
                                                            ) : (
                                                                holding.quantity.toLocaleString()
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {isEditing ? (
                                                                <FormattedNumberInput
                                                                    value={editValues.averagePrice}
                                                                    onChange={(val) =>
                                                                        setEditValues((prev) => ({ ...prev, averagePrice: val }))
                                                                    }
                                                                    className="w-28 text-right"
                                                                    disabled={isRefreshing || savingSnapshot}
                                                                />
                                                            ) : (
                                                                formatCurrency(holding.averagePrice, holding.currency)
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatCurrency(holding.currentPrice, holding.currency)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            <div className="flex flex-col items-end">
                                                                <span>{formatCurrency(holding.totalCost, holding.currency)}</span>
                                                                {holding.currency === 'USD' && summary?.exchangeRate && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {formatCurrency(holding.totalCost * summary.exchangeRate, 'KRW')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            <div className="flex flex-col items-end">
                                                                <span>{formatCurrency(holding.currentValue, holding.currency)}</span>
                                                                {holding.currency === 'USD' && summary?.exchangeRate && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {formatCurrency(holding.currentValue * summary.exchangeRate, 'KRW')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell
                                                            className={cn('text-right', isProfit ? 'text-red-600' : 'text-blue-600')}
                                                        >
                                                            <div className="flex flex-col items-end">
                                                                <span>{formatCurrency(Math.abs(holding.profit), holding.currency)}</span>
                                                                {holding.currency === 'USD' && summary?.exchangeRate && (
                                                                    <span className="text-xs opacity-80">
                                                                        {formatCurrency(Math.abs(holding.profit * summary.exchangeRate), 'KRW')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell
                                                            className={cn(
                                                                'text-right font-bold',
                                                                isProfit ? 'text-red-600' : 'text-blue-600'
                                                            )}
                                                        >
                                                            {formatProfitRate(holding.profitRate)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-1">
                                                                {isEditing ? (
                                                                    <>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleSaveEdit(holding.id)}
                                                                            disabled={isRefreshing || savingSnapshot || savingRowId !== null}
                                                                        >
                                                                            {savingRowId === holding.id ? (
                                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                            ) : (
                                                                                <Check className="w-4 h-4" />
                                                                            )}
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={handleCancelEdit}
                                                                            disabled={isRefreshing || savingSnapshot || savingRowId !== null}
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleStartEdit(holding)}
                                                                            disabled={isRefreshing || savingSnapshot}
                                                                        >
                                                                            <Edit2 className="w-4 h-4" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleDeleteHolding(holding.id)}
                                                                            disabled={isRefreshing || savingSnapshot}
                                                                        >
                                                                            <Trash2 className="w-4 h-4 text-red-500" />
                                                                        </Button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
