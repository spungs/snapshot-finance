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
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableTableRow } from './sortable-table-row'

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
    displayOrder: number
}

type SortKey = 'custom' | 'stockName' | 'quantity' | 'averagePrice' | 'currentPrice' | 'totalCost' | 'currentValue' | 'profit' | 'profitRate'
type SortDirection = 'asc' | 'desc'

interface SortConfig {
    key: SortKey
    direction: SortDirection
}

interface FilterConfig {
    market: 'all' | 'US' | 'KR'
    profitStatus: 'all' | 'plus' | 'minus'
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
    initialData?: {
        holdings: Holding[]
        summary: Summary
    }
}

export function HoldingsManager({ initialData }: Props) {
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

    // 정렬 및 필터 상태
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'custom', direction: 'asc' })
    const [filterConfig, setFilterConfig] = useState<FilterConfig>({ market: 'all', profitStatus: 'all' })

    const handleSort = (key: SortKey) => {
        setSortConfig((current) => {
            if (current.key === key) {
                // If already sorting by this key, toggle direction.
                // Exception: 'custom' sort always resets to asc effectively (or toggle if we wanted reverse custom order, but usually custom is just one way)
                if (key === 'custom') return { key, direction: 'asc' }
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
            }
            return { key, direction: key === 'stockName' ? 'asc' : 'desc' } // Default desc for numbers, asc for text
        })
    }

    const getSortedAndFilteredHoldings = useCallback(() => {
        let result = [...holdings]

        // 1. Filter
        if (filterConfig.market !== 'all') {
            result = result.filter(h => h.market === filterConfig.market)
        }
        if (filterConfig.profitStatus !== 'all') {
            result = result.filter(h => {
                if (filterConfig.profitStatus === 'plus') return h.profit >= 0
                if (filterConfig.profitStatus === 'minus') return h.profit < 0
                return true
            })
        }

        // 2. Sort
        result.sort((a, b) => {
            const { key, direction } = sortConfig
            const modifier = direction === 'asc' ? 1 : -1

            if (key === 'custom') {
                return (a.displayOrder - b.displayOrder) * modifier
            }

            // Handle number comparison
            if (key !== 'stockName') {
                return (a[key] - b[key]) * modifier
            }

            // Handle string comparison
            return a.stockName.localeCompare(b.stockName) * modifier
        })

        return result
    }, [holdings, filterConfig, sortConfig])

    const filteredHoldings = getSortedAndFilteredHoldings()
    const isDragEnabled = sortConfig.key === 'custom' && filterConfig.market === 'all' && filterConfig.profitStatus === 'all'

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

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            setHoldings((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id)
                const newIndex = items.findIndex((item) => item.id === over.id)
                const newItems = arrayMove(items, oldIndex, newIndex)

                // Optimistic UI Update + API Call
                // Debounce or immediate call? Immediate is fine for now as user won't spam reorder too fast usually
                // But better to trigger API
                saveOrder(newItems)

                return newItems
            })
        }
    }

    const saveOrder = async (newHoldings: Holding[]) => {
        try {
            const orderItems = newHoldings.map((h, index) => ({ id: h.id, order: index }))
            // Create a dedicated API function or use fetch directly
            await fetch('/api/holdings/reorder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: orderItems })
            })
        } catch (err) {
            console.error('Failed to save order', err)
            // Optionally revert state on error, but keeping it simple for now
        }
    }

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
                <CardHeader className="pb-2 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <CardTitle className="text-lg">{t('holdings')} ({filteredHoldings.length})</CardTitle>
                        <Button
                            onClick={handleSaveSnapshot}
                            disabled={savingSnapshot || holdings.length === 0 || isRefreshing}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-2 w-full sm:w-auto"
                        >
                            <Camera className="w-4 h-4" />
                            {savingSnapshot ? '저장 중...' : t('saveSnapshot')}
                        </Button>
                    </div>

                    {/* 필터 및 정렬 컨트롤 */}
                    <div className="flex flex-wrap gap-3 p-1 bg-muted/30 rounded-lg items-center">
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">필터:</span>
                        </div>

                        <Select
                            value={filterConfig.market}
                            onValueChange={(val: any) => setFilterConfig(prev => ({ ...prev, market: val }))}
                        >
                            <SelectTrigger className="w-[100px] h-8 text-xs">
                                <SelectValue placeholder="시장" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체 시장</SelectItem>
                                <SelectItem value="US">미국(US)</SelectItem>
                                <SelectItem value="KR">한국(KR)</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={filterConfig.profitStatus}
                            onValueChange={(val: any) => setFilterConfig(prev => ({ ...prev, profitStatus: val }))}
                        >
                            <SelectTrigger className="w-[100px] h-8 text-xs">
                                <SelectValue placeholder="수익 상태" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체 수익</SelectItem>
                                <SelectItem value="plus">수익 (+)</SelectItem>
                                <SelectItem value="minus">손실 (-)</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="ml-auto flex items-center gap-2">
                            {!isDragEnabled && (
                                <Badge variant="destructive" className="text-[10px] h-5 px-1.5 font-normal">
                                    커스텀 정렬 비활성
                                </Badge>
                            )}
                            {(filterConfig.market !== 'all' || filterConfig.profitStatus !== 'all') && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs px-2"
                                    onClick={() => setFilterConfig({ market: 'all', profitStatus: 'all' })}
                                >
                                    필터 초기화
                                </Button>
                            )}
                            {sortConfig.key !== 'custom' && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs px-2"
                                    onClick={() => setSortConfig({ key: 'custom', direction: 'asc' })}
                                >
                                    정렬 초기화
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className={cn("transition-opacity duration-200", (isRefreshing || savingSnapshot) && "opacity-60 pointer-events-none")}>
                        {filteredHoldings.length === 0 ? (
                            <div className="py-12 text-center text-muted-foreground">
                                {holdings.length === 0 ? "보유 종목이 없습니다. 위에서 종목을 추가해주세요." : "필터 조건에 맞는 종목이 없습니다."}
                            </div>
                        ) : (
                            <div className="overflow-x-auto -mx-4 sm:mx-0">
                                <div className="min-w-[700px] px-4 sm:px-0">
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                    <SortableHeader
                                                        label={t('stockName')}
                                                        sortKey="stockName"
                                                        currentSort={sortConfig}
                                                        onSort={handleSort}
                                                    />
                                                    <SortableHeader
                                                        label={t('quantity')}
                                                        sortKey="quantity"
                                                        align="right"
                                                        currentSort={sortConfig}
                                                        onSort={handleSort}
                                                    />
                                                    <SortableHeader
                                                        label={t('averagePrice')}
                                                        sortKey="averagePrice"
                                                        align="right"
                                                        currentSort={sortConfig}
                                                        onSort={handleSort}
                                                    />
                                                    <SortableHeader
                                                        label={t('currentPrice')}
                                                        sortKey="currentPrice"
                                                        align="right"
                                                        currentSort={sortConfig}
                                                        onSort={handleSort}
                                                    />
                                                    <SortableHeader
                                                        label={t('totalCost')}
                                                        sortKey="totalCost"
                                                        align="right"
                                                        currentSort={sortConfig}
                                                        onSort={handleSort}
                                                    />
                                                    <SortableHeader
                                                        label={t('evaluatedValue')}
                                                        sortKey="currentValue"
                                                        align="right"
                                                        currentSort={sortConfig}
                                                        onSort={handleSort}
                                                    />
                                                    <SortableHeader
                                                        label={t('pl')}
                                                        sortKey="profit"
                                                        align="right"
                                                        currentSort={sortConfig}
                                                        onSort={handleSort}
                                                    />
                                                    <SortableHeader
                                                        label={t('returnRate')}
                                                        sortKey="profitRate"
                                                        align="right"
                                                        currentSort={sortConfig}
                                                        onSort={handleSort}
                                                    />
                                                    <TableHead className="text-right">{t('actions')}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                <SortableContext
                                                    items={filteredHoldings.map(h => h.id)}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    {filteredHoldings.map((holding) => {
                                                        const isProfit = holding.profit >= 0
                                                        const isEditing = editingId === holding.id

                                                        return (
                                                            <SortableTableRow
                                                                key={holding.id}
                                                                id={holding.id}
                                                                disabled={isRefreshing || savingSnapshot || !!editingId || !isDragEnabled}
                                                            >
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
                                                                            disabled={isRefreshing || savingSnapshot || savingRowId !== null}
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
                                                                            disabled={isRefreshing || savingSnapshot || savingRowId !== null}
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
                                                            </SortableTableRow>
                                                        )
                                                    })}
                                                </SortableContext>
                                            </TableBody>
                                        </Table>
                                    </DndContext>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function SortableHeader({
    label,
    sortKey,
    currentSort,
    onSort,
    align = 'left'
}: {
    label: string,
    sortKey: SortKey,
    currentSort: SortConfig,
    onSort: (key: SortKey) => void,
    align?: 'left' | 'right'
}) {
    const isActive = currentSort.key === sortKey
    return (
        <TableHead
            className={cn(
                "cursor-pointer hover:bg-muted/50 transition-colors select-none",
                align === 'right' ? "text-right" : "text-left",
                isActive && "text-primary font-bold"
            )}
            onClick={() => onSort(sortKey)}
        >
            <div className={cn("flex items-center gap-1", align === 'right' && "justify-end")}>
                {label}
                {isActive ? (
                    currentSort.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                )}
            </div>
        </TableHead>
    )
}
