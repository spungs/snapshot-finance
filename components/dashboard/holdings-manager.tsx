'use client'

import React, { useEffect, useState, useCallback } from 'react'
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
import { formatCurrency, formatProfitRate, formatNumber } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { translations } from '@/lib/i18n/translations'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { PortfolioSummaryCard } from '@/components/dashboard/portfolio-summary-card'
import { Skeleton } from '@/components/ui/skeleton'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { Plus, Trash2, Camera, Edit2, Check, X, Loader2, ListCheck } from 'lucide-react'
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
import { PortfolioImportDialog } from '@/components/dashboard/portfolio-import-dialog'

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

type SortKey = 'custom' | 'stockName' | 'quantity' | 'averagePrice' | 'currentPrice' | 'totalCost' | 'currentValue' | 'profit' | 'profitRate' | 'weight'
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
    cashBalance?: number
    totalStockValue?: number
    targetAsset?: number
}

interface HoldingsManagerProps {
    initialHoldings: Holding[]
    summary: Summary
    triggerRefresh: () => void
}

export function HoldingsManager({ initialHoldings, summary, triggerRefresh }: HoldingsManagerProps) {
    const { t, language } = useLanguage()
    const { baseCurrency } = useCurrency()
    const trans = translations[language]
    const [holdings, setHoldings] = useState<Holding[]>(initialHoldings)
    const [currentSummary, setCurrentSummary] = useState<Summary | null>(summary)
    const [loading, setLoading] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [savingSnapshot, setSavingSnapshot] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [savingRowId, setSavingRowId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
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
    const [isImportOpen, setIsImportOpen] = useState(false)

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
                if (key === 'weight') {
                    // Sorting by weight is equivalent to sorting by normalized current value
                    const getNormalizedVal = (h: Holding) => (h.currency === 'USD' && summary?.exchangeRate) ? h.currentValue * summary.exchangeRate : h.currentValue
                    return (getNormalizedVal(a) - getNormalizedVal(b)) * modifier
                }
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
            // 초기 로딩이 아닐 때만 refreshing 표시 (데이터가 있을 때)
            setIsRefreshing(true)

            const response = await holdingsApi.getList()
            if (response.success && response.data) {
                setHoldings(response.data.holdings)
                setCurrentSummary(response.data.summary)
            } else {
                setError(response.error?.message || t('fetchBalanceFailed'))
            }
        } catch (err) {
            setError(t('networkError'))
        } finally {
            setLoading(false)
            setIsRefreshing(false)
        }
    }, [t])

    // Initial data sync - only runs when initialData prop changes (e.g. server re-render)
    // We use a ref to track if it's the very first mount vs subsequent updates
    const isFirstMount = React.useRef(true)
    // Initial data sync - only runs when props change
    useEffect(() => {
        setHoldings(initialHoldings)
        setCurrentSummary(summary)
        setLoading(false)
    }, [initialHoldings, summary])

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
                alert(response.error?.message || t('addStockFailed'))
            }
        } catch (err) {
            alert(t('networkError'))
        } finally {
            setAdding(false)
        }
    }

    const handleDeleteHolding = async (id: string) => {
        if (!confirm(t('confirmDeleteHolding'))) return

        setDeletingId(id)
        try {
            const response = await holdingsApi.delete(id)
            if (response.success) {
                fetchHoldings()
            } else {
                alert(response.error?.message || t('deleteFailed'))
            }
        } catch (err) {
            alert(t('networkError'))
        } finally {
            setDeletingId(null)
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
                alert(response.error?.message || t('genericUpdateFailed'))
            }
        } catch (err) {
            alert(t('networkError'))
        } finally {
            setSavingRowId(null)
        }
    }

    const handleSaveSnapshot = async () => {
        if (holdings.length === 0) {
            alert(t('noHoldingsToSave'))
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
                cashBalance: currentSummary?.cashBalance ?? summary?.cashBalance ?? 0,
                note: `${t('snapshotPrefix')} - ${new Date().toLocaleDateString(language === 'ko' ? 'ko-KR' : 'en-US')}`,
            })
            if (response.success) {
                alert(t('saveSnapshotSuccess'))
            } else {
                alert(response.error?.message || t('saveSnapshotFailed'))
            }
        } catch (err) {
            alert(t('networkError'))
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
                    <p className="text-destructive mb-4">{error}</p>
                    <Button onClick={() => fetchHoldings()}>{t('retry')}</Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="min-h-screen pb-20">
            <div className="space-y-6">
                <PortfolioImportDialog
                    open={isImportOpen}
                    onOpenChange={setIsImportOpen}
                    currentCash={currentSummary?.cashBalance}
                    currency={baseCurrency}
                    onUpdate={triggerRefresh}
                />
                {/* 요약 카드 */}
                {currentSummary && (
                    <PortfolioSummaryCard
                        {...currentSummary}
                        profitRate={currentSummary.totalProfitRate}
                        isEditable={true}
                    />
                )}

                {/* 종목 추가 */}
                <Card>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            {t('addStock')}
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setIsImportOpen(true)}>
                            <ListCheck className="h-4 w-4 mr-2" />
                            {trans.portfolioManage.bulkImport}
                        </Button>
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
                                    {t('averagingDown')}
                                </Label>
                            </div>
                            <Button
                                onClick={handleAddHolding}
                                disabled={!newStock || !newQuantity || !newAveragePrice || adding}
                            >
                                {adding ? t('addingProgress') : t('add')}
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
                                {savingSnapshot ? t('savingSnapshotProgress') : t('saveSnapshot')}
                            </Button>
                        </div>

                        {/* 필터 및 정렬 컨트롤 */}
                        <div className="flex flex-wrap gap-3 p-1 bg-muted/30 rounded-lg items-center">
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{t('filter')}:</span>
                            </div>

                            <Select
                                value={filterConfig.market}
                                onValueChange={(val: any) => setFilterConfig(prev => ({ ...prev, market: val }))}
                            >
                                <SelectTrigger className="min-w-[100px] w-auto h-8 text-xs">
                                    <SelectValue placeholder={t('market')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('marketAll')}</SelectItem>
                                    <SelectItem value="US">{t('marketUS')}</SelectItem>
                                    <SelectItem value="KR">{t('marketKR')}</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select
                                value={filterConfig.profitStatus}
                                onValueChange={(val: any) => setFilterConfig(prev => ({ ...prev, profitStatus: val }))}
                            >
                                <SelectTrigger className="min-w-[100px] w-auto h-8 text-xs">
                                    <SelectValue placeholder={t('profitStatus')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('statusAll')}</SelectItem>
                                    <SelectItem value="plus">{t('statusPlus')}</SelectItem>
                                    <SelectItem value="minus">{t('statusMinus')}</SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="ml-auto flex items-center gap-2">
                                {!isDragEnabled && (
                                    <Badge variant="destructive" className="text-[10px] h-5 px-1.5 font-normal">
                                        {t('customSortDisabled')}
                                    </Badge>
                                )}
                                {(filterConfig.market !== 'all' || filterConfig.profitStatus !== 'all') && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs px-2"
                                        onClick={() => setFilterConfig({ market: 'all', profitStatus: 'all' })}
                                    >
                                        {t('resetFilter')}
                                    </Button>
                                )}
                                {sortConfig.key !== 'custom' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs px-2"
                                        onClick={() => setSortConfig({ key: 'custom', direction: 'asc' })}
                                    >
                                        {t('resetSort')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className={cn("transition-opacity duration-200", (isRefreshing || savingSnapshot) && "opacity-60 pointer-events-none")}>
                            {filteredHoldings.length === 0 ? (
                                <div className="py-12 text-center text-muted-foreground">
                                    {holdings.length === 0 ? t('holdingsEmpty') : t('filterEmpty')}
                                </div>
                            ) : (
                                <>
                                    {/* Mobile View: Cards */}
                                    <div className="md:hidden space-y-4 p-4">
                                        {filteredHoldings.map((holding) => {
                                            const isProfit = holding.profit >= 0
                                            const currency = holding.currency || 'KRW'
                                            return (
                                                <div key={holding.id} className="bg-muted/40 rounded-lg p-4 border space-y-3">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="font-semibold text-lg">{holding.stockName}</div>
                                                            <div className="text-sm text-muted-foreground">{holding.stockCode}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="flex justify-end gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleStartEdit(holding)}
                                                                    disabled={isRefreshing || savingSnapshot || deletingId === holding.id}
                                                                >
                                                                    <Edit2 className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleDeleteHolding(holding.id)}
                                                                    disabled={isRefreshing || savingSnapshot || deletingId === holding.id}
                                                                >
                                                                    {deletingId === holding.id ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                                                                    ) : (
                                                                        <Trash2 className="w-4 h-4 text-destructive" />
                                                                    )}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>



                                                    <div className="grid grid-cols-2 gap-4 border-t pt-3">
                                                        <div>
                                                            <div className="text-xs text-muted-foreground mb-1">{t('quantity')}</div>
                                                            <div className="font-medium">{formatNumber(holding.quantity)}{t('countUnit')}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-muted-foreground mb-1">{t('avgPrice')}</div>
                                                            <div className="font-medium">{formatCurrency(holding.averagePrice, currency)}</div>
                                                        </div>

                                                        <div>
                                                            <div className="text-xs text-muted-foreground mb-1">{t('currentPrice')}</div>
                                                            <div className="font-medium">{formatCurrency(holding.currentPrice, currency)}</div>
                                                            {holding.currency === 'USD' && summary?.exchangeRate && language === 'ko' && (
                                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                                    {formatCurrency(holding.currentPrice * summary.exchangeRate, 'KRW')}
                                                                </div>
                                                            )}
                                                            {(holding.currency === 'KRW' || !holding.currency) && summary?.exchangeRate && language === 'en' && (
                                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                                    {formatCurrency(holding.currentPrice / summary.exchangeRate, 'USD')}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-muted-foreground mb-1">{t('totalCost')}</div>
                                                            <div className="font-medium">{formatCurrency(holding.totalCost, currency)}</div>
                                                            {holding.currency === 'USD' && summary?.exchangeRate && language === 'ko' && (
                                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                                    {formatCurrency(holding.totalCost * summary.exchangeRate, 'KRW')}
                                                                </div>
                                                            )}
                                                            {(holding.currency === 'KRW' || !holding.currency) && summary?.exchangeRate && language === 'en' && (
                                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                                    {formatCurrency(holding.totalCost / summary.exchangeRate, 'USD')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center bg-background p-3 rounded border">
                                                        <div>
                                                            <div className="text-xs text-muted-foreground">{t('pl')}</div>
                                                            <div className={cn(
                                                                "font-medium",
                                                                isProfit ? 'text-red-600' : 'text-blue-600'
                                                            )}>
                                                                {formatCurrency(Math.abs(holding.profit), currency)}
                                                            </div>
                                                            {holding.currency === 'USD' && summary?.exchangeRate && language === 'ko' && (
                                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                                    {formatCurrency(Math.abs(holding.profit * summary.exchangeRate), 'KRW')}
                                                                </div>
                                                            )}
                                                            {(holding.currency === 'KRW' || !holding.currency) && summary?.exchangeRate && language === 'en' && (
                                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                                    {formatCurrency(Math.abs(holding.profit / summary.exchangeRate), 'USD')}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-muted-foreground">{t('returnRate')}</div>
                                                            <div className={cn(
                                                                "font-bold text-lg",
                                                                isProfit ? 'text-red-600' : 'text-blue-600'
                                                            )}>
                                                                {formatProfitRate(holding.profitRate)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center border-t pt-3 mt-3 border-border/50">
                                                        <div className="text-sm font-medium">{t('weight')}</div>
                                                        <div className="font-bold text-primary">
                                                            {formatNumber(summary?.totalValue ? ((holding.currency === 'USD' && summary?.exchangeRate ? holding.currentValue * summary.exchangeRate : holding.currentValue) / summary.totalValue) * 100 : 0, 1)}%
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Desktop View: Table */}
                                    <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0">
                                        <div className="min-w-[700px] px-4 sm:px-0">
                                            <DndContext
                                                id="holdings-dnd-context"
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
                                                            <SortableHeader
                                                                label={t('weight')}
                                                                sortKey="weight"
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
                                                                        disabled={isRefreshing || savingSnapshot || !!editingId || !isDragEnabled || deletingId === holding.id}
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
                                                                                {holding.currency === 'USD' && summary?.exchangeRate && language === 'ko' && (
                                                                                    <span className="text-xs text-muted-foreground">
                                                                                        {formatCurrency(holding.totalCost * summary.exchangeRate, 'KRW')}
                                                                                    </span>
                                                                                )}
                                                                                {(holding.currency === 'KRW' || !holding.currency) && summary?.exchangeRate && language === 'en' && (
                                                                                    <span className="text-xs text-muted-foreground">
                                                                                        {formatCurrency(holding.totalCost / summary.exchangeRate, 'USD')}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-medium">
                                                                            <div className="flex flex-col items-end">
                                                                                <span>{formatCurrency(holding.currentValue, holding.currency)}</span>
                                                                                {holding.currency === 'USD' && summary?.exchangeRate && language === 'ko' && (
                                                                                    <span className="text-xs text-muted-foreground">
                                                                                        {formatCurrency(holding.currentValue * summary.exchangeRate, 'KRW')}
                                                                                    </span>
                                                                                )}
                                                                                {(holding.currency === 'KRW' || !holding.currency) && summary?.exchangeRate && language === 'en' && (
                                                                                    <span className="text-xs text-muted-foreground">
                                                                                        {formatCurrency(holding.currentValue / summary.exchangeRate, 'USD')}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell
                                                                            className={cn('text-right', isProfit ? 'text-red-600' : 'text-blue-600')}
                                                                        >
                                                                            <div className="flex flex-col items-end">
                                                                                <span>{formatCurrency(Math.abs(holding.profit), holding.currency)}</span>
                                                                                {holding.currency === 'USD' && summary?.exchangeRate && language === 'ko' && (
                                                                                    <span className="text-xs opacity-80">
                                                                                        {formatCurrency(Math.abs(holding.profit * summary.exchangeRate), 'KRW')}
                                                                                    </span>
                                                                                )}
                                                                                {(holding.currency === 'KRW' || !holding.currency) && summary?.exchangeRate && language === 'en' && (
                                                                                    <span className="text-xs opacity-80">
                                                                                        {formatCurrency(Math.abs(holding.profit / summary.exchangeRate), 'USD')}
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
                                                                        <TableCell className="text-right font-medium">
                                                                            <span className="inline-block bg-muted/50 rounded px-2 py-0.5 text-xs">
                                                                                {formatNumber(summary?.totalValue ? ((holding.currency === 'USD' && summary?.exchangeRate ? holding.currentValue * summary.exchangeRate : holding.currentValue) / summary.totalValue) * 100 : 0, 1)}%
                                                                            </span>
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
                                                                                            disabled={isRefreshing || savingSnapshot || deletingId === holding.id}
                                                                                        >
                                                                                            <Edit2 className="w-4 h-4" />
                                                                                        </Button>
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="icon"
                                                                                            onClick={() => handleDeleteHolding(holding.id)}
                                                                                            disabled={isRefreshing || savingSnapshot || deletingId === holding.id}
                                                                                        >
                                                                                            {deletingId === holding.id ? (
                                                                                                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                                                                                            ) : (
                                                                                                <Trash2 className="w-4 h-4 text-red-500" />
                                                                                            )}
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
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
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
