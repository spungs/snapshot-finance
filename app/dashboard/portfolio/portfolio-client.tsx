'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Drawer } from 'vaul'
import { holdingsApi } from '@/lib/api/client'
import { formatCurrency, formatNumber, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { DonutChart } from '@/components/dashboard/donut-chart'
import { CashBalanceDialog } from '@/components/dashboard/cash-balance-dialog'
import { Plus, Edit2, Trash2, Check, X, Loader2, ArrowUp, ArrowDown, MoreVertical, Wallet } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const SEGMENT_COLORS = [
    '#3b82f6', '#a855f7', '#10b981', '#ef4444', '#f59e0b',
    '#ec4899', '#06b6d4', '#8b5cf6', '#14b8a6', '#f97316',
    '#6366f1', '#84cc16',
]

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
    exchangeRate: number
    cashBalance: number
}

type SortKey = 'currentValue' | 'totalCost' | 'profit'
type SortDir = 'desc' | 'asc'

interface Props {
    initialHoldings: Holding[]
    summary: Summary
}

function UpDown({ value, big = false }: { value: number; big?: boolean }) {
    const isUp = value >= 0
    return (
        <span
            className={cn(
                'numeric font-bold tracking-tight inline-flex items-center gap-0.5',
                isUp ? 'text-profit' : 'text-loss',
                big ? 'text-[15px]' : 'text-[12.5px]',
            )}
        >
            <span aria-hidden>{isUp ? '▲' : '▼'}</span>
            <span>{Math.abs(value).toFixed(2)}%</span>
        </span>
    )
}

export function PortfolioClient({ initialHoldings, summary }: Props) {
    const { t, language } = useLanguage()
    const { baseCurrency } = useCurrency()
    const [holdings, setHoldings] = useState<Holding[]>(initialHoldings)
    const [currentSummary, setCurrentSummary] = useState<Summary>(summary)
    const [sortKey, setSortKey] = useState<SortKey>('currentValue')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [selectedSegIdx, setSelectedSegIdx] = useState<number | null>(null)

    // Add form (FAB + bottom drawer)
    const [newStock, setNewStock] = useState<any>(null)
    const [newQty, setNewQty] = useState('')
    const [newPrice, setNewPrice] = useState('')
    const [adding, setAdding] = useState(false)
    const [showAdd, setShowAdd] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const handleDrawerChange = (next: boolean) => {
        if (!next) {
            setNewStock(null)
            setNewQty('')
            setNewPrice('')
        }
        setShowAdd(next)
    }

    // Edit/delete
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValues, setEditValues] = useState({ quantity: '', averagePrice: '' })
    const [savingRow, setSavingRow] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const exRate = currentSummary.exchangeRate || 1435

    const refresh = useCallback(async () => {
        const res = await holdingsApi.getList()
        if (res.success && res.data) {
            setHoldings(res.data.holdings)
            setCurrentSummary(res.data.summary)
            setSelectedSegIdx(null)
        }
    }, [])

    const sortedHoldings = useMemo(() => {
        const arr = [...holdings]
        arr.sort((a, b) => {
            const norm = (h: Holding, key: SortKey) =>
                h.currency === 'USD' ? h[key] * exRate : h[key]
            const diff = norm(a, sortKey) - norm(b, sortKey)
            return sortDir === 'desc' ? -diff : diff
        })
        return arr
    }, [holdings, sortKey, sortDir, exRate])

    const totalValueNormalized = currentSummary.totalValue || 1

    const holdingsWithWeight = useMemo(() =>
        sortedHoldings.map((h, idx) => {
            const valNorm = h.currency === 'USD' ? h.currentValue * exRate : h.currentValue
            const weight = (valNorm / totalValueNormalized) * 100
            return { ...h, weight, color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length] }
        }),
        [sortedHoldings, totalValueNormalized, exRate]
    )

    // Build donut from full holdings list (preserves color stability across sort changes)
    const donutSegments = useMemo(() => {
        const sortedByValue = [...holdings].sort((a, b) => {
            const norm = (h: Holding) => h.currency === 'USD' ? h.currentValue * exRate : h.currentValue
            return norm(b) - norm(a)
        })
        return sortedByValue.map((h, i) => ({
            value: h.currency === 'USD' ? h.currentValue * exRate : h.currentValue,
            color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
            holding: h,
        }))
    }, [holdings, exRate])

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const handleAdd = async () => {
        if (!newStock || !newQty || !newPrice) return
        setAdding(true)
        try {
            const res = await holdingsApi.create({
                stockId: newStock.id,
                quantity: parseInt(newQty.replace(/,/g, '')),
                averagePrice: parseFloat(newPrice.replace(/,/g, '')),
                mode: 'overwrite',
            })
            if (res.success) {
                setNewStock(null)
                setNewQty('')
                setNewPrice('')
                setShowAdd(false)
                await refresh()
            } else {
                alert(res.error?.message || t('addStockFailed'))
            }
        } catch {
            alert(t('networkError'))
        } finally {
            setAdding(false)
        }
    }

    const startEdit = (h: Holding) => {
        setEditingId(h.id)
        setEditValues({
            quantity: h.quantity.toString(),
            averagePrice: h.averagePrice.toString(),
        })
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditValues({ quantity: '', averagePrice: '' })
    }

    const saveEdit = async (id: string) => {
        if (savingRow) return
        setSavingRow(id)
        try {
            const res = await holdingsApi.update(id, {
                quantity: parseInt(editValues.quantity),
                averagePrice: parseFloat(editValues.averagePrice),
            })
            if (res.success) {
                setEditingId(null)
                await refresh()
            } else {
                alert(res.error?.message || t('genericUpdateFailed'))
            }
        } catch {
            alert(t('networkError'))
        } finally {
            setSavingRow(null)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm(t('confirmDeleteHolding'))) return
        setDeletingId(id)
        try {
            const res = await holdingsApi.delete(id)
            if (res.success) await refresh()
            else alert(res.error?.message || t('deleteFailed'))
        } catch {
            alert(t('networkError'))
        } finally {
            setDeletingId(null)
        }
    }

    const convert = (v: number) => baseCurrency === 'KRW' ? v : v / exRate
    const displayTotal = convert(currentSummary.totalValue)

    return (
        <div className="max-w-[480px] sm:max-w-2xl mx-auto w-full">
            {/* Hero */}
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[32px] text-foreground">
                    {language === 'ko' ? '현재 보유 자산' : 'Current Holdings'}
                </h1>
            </section>

            {/* Donut + legend */}
            {holdings.length > 0 && (() => {
                const selectedSeg = selectedSegIdx !== null ? donutSegments[selectedSegIdx] : null
                const selectedHolding = selectedSeg?.holding ?? null
                const selectedWeight = selectedSeg
                    ? (selectedSeg.value / (currentSummary.totalValue || 1)) * 100
                    : 0
                const selectedValueDisplay = selectedHolding
                    ? (baseCurrency === 'KRW'
                        ? (selectedHolding.currency === 'USD' ? selectedHolding.currentValue * exRate : selectedHolding.currentValue)
                        : (selectedHolding.currency === 'USD' ? selectedHolding.currentValue : selectedHolding.currentValue / exRate))
                    : 0

                return (
                    <section
                        className="mx-4 mb-4 p-5 bg-card border border-border"
                        onClick={(e) => {
                            // 카드 빈 영역 탭 시 선택 해제 (레전드/도넛 path 클릭은 stopPropagation 처리)
                            if (e.target === e.currentTarget) setSelectedSegIdx(null)
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div className="shrink-0">
                                <DonutChart
                                    data={donutSegments}
                                    size={130}
                                    thickness={18}
                                    selectedIndex={selectedSegIdx}
                                    onSegmentSelect={setSelectedSegIdx}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                {selectedHolding ? (
                                    <>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span
                                                className="w-2 h-2 rounded-sm shrink-0"
                                                style={{ background: selectedSeg!.color }}
                                            />
                                            <span className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase truncate">
                                                {selectedHolding.stockCode}
                                            </span>
                                        </div>
                                        <div className="font-serif text-[18px] font-semibold text-foreground numeric leading-tight">
                                            {formatCurrency(selectedValueDisplay, baseCurrency)}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                            <span className="numeric font-semibold text-foreground">
                                                {selectedWeight.toFixed(1)}%
                                            </span>
                                            <span>·</span>
                                            <UpDown value={selectedHolding.profitRate} />
                                        </div>
                                        <div className="mt-1 text-[11px] text-muted-foreground truncate">
                                            {selectedHolding.stockName}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                                            {t('totalValue')}
                                        </div>
                                        <div className="font-serif text-[20px] font-semibold text-foreground numeric leading-tight mt-0.5">
                                            {formatCurrency(displayTotal, baseCurrency)}
                                        </div>
                                        <div className="mt-1 text-[11px] text-muted-foreground">
                                            {language === 'ko' ? `${holdings.length}개 종목` : `${holdings.length} holdings`}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-2">
                            {donutSegments.slice(0, 6).map((seg, i) => {
                                const w = (seg.value / (currentSummary.totalValue || 1)) * 100
                                const isSelected = selectedSegIdx === i
                                const isDimmed = selectedSegIdx !== null && !isSelected
                                return (
                                    <button
                                        key={seg.holding.id}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedSegIdx(isSelected ? null : i)
                                        }}
                                        className={cn(
                                            'flex items-center gap-2 min-w-0 transition-opacity text-left py-0.5',
                                            isDimmed && 'opacity-30',
                                        )}
                                    >
                                        <span
                                            className="w-2 h-2 rounded-sm shrink-0"
                                            style={{ background: seg.color }}
                                        />
                                        <span className="text-[11px] text-muted-foreground truncate flex-1">
                                            {seg.holding.stockCode}
                                        </span>
                                        <span className="text-[11px] font-bold text-foreground numeric">
                                            {w.toFixed(1)}%
                                        </span>
                                    </button>
                                )
                            })}
                            {donutSegments.length > 6 && (() => {
                                const restValue = donutSegments.slice(6).reduce((sum, s) => sum + s.value, 0)
                                const restWeight = (restValue / (currentSummary.totalValue || 1)) * 100
                                const restCount = donutSegments.length - 6
                                const restSelected = selectedSegIdx !== null && selectedSegIdx >= 6
                                const restDimmed = selectedSegIdx !== null && !restSelected
                                return (
                                    <div
                                        className={cn(
                                            'flex items-center gap-2 min-w-0 transition-opacity py-0.5',
                                            restDimmed && 'opacity-30',
                                        )}
                                    >
                                        <span className="w-2 h-2 rounded-sm shrink-0 bg-muted-foreground/40" />
                                        <span className="text-[11px] text-muted-foreground truncate flex-1">
                                            {language === 'ko' ? `기타 ${restCount}개` : `Others (${restCount})`}
                                        </span>
                                        <span className="text-[11px] font-bold text-foreground numeric">
                                            {restWeight.toFixed(1)}%
                                        </span>
                                    </div>
                                )
                            })()}
                        </div>
                    </section>
                )
            })()}

            {/* Cash balance — 예수금 (수정 트리거 포함) */}
            <section className="mx-4 mb-4 p-4 bg-card border border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-sm bg-accent-soft flex items-center justify-center shrink-0">
                        <Wallet className="w-4 h-4 text-primary" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                            {language === 'ko' ? '예수금' : 'Cash balance'}
                        </div>
                        <div className="font-serif text-lg font-semibold text-foreground mt-0.5 numeric truncate">
                            {formatCurrency(convert(currentSummary.cashBalance), baseCurrency)}
                        </div>
                    </div>
                </div>
                <CashBalanceDialog
                    initialBalance={currentSummary.cashBalance}
                    currency={baseCurrency}
                    exchangeRate={exRate}
                    onSuccess={refresh}
                >
                    <button
                        type="button"
                        className="text-[11px] font-bold tracking-wide text-primary px-3 py-2 inline-flex items-center gap-1 min-h-[40px] hover:bg-accent-soft transition-colors shrink-0"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                        {language === 'ko' ? '수정' : 'Edit'}
                    </button>
                </CashBalanceDialog>
            </section>

            {/* Holdings header — count + sort */}
            <div className="px-6 pb-3 flex justify-between items-center gap-2 flex-wrap">
                <span className="eyebrow">
                    {language === 'ko' ? '보유 종목' : 'Holdings'} · {holdings.length}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                    <SortToggle
                        active={sortKey === 'currentValue'}
                        dir={sortDir}
                        label={language === 'ko' ? '평가금' : 'Value'}
                        onClick={() => handleSort('currentValue')}
                    />
                    <SortToggle
                        active={sortKey === 'totalCost'}
                        dir={sortDir}
                        label={language === 'ko' ? '매입금' : 'Cost'}
                        onClick={() => handleSort('totalCost')}
                    />
                    <SortToggle
                        active={sortKey === 'profit'}
                        dir={sortDir}
                        label={language === 'ko' ? '수익금' : 'P/L'}
                        onClick={() => handleSort('profit')}
                    />
                </div>
            </div>

            {/* Holdings list */}
            <div className="px-4 pb-4 space-y-1.5">
                {holdingsWithWeight.length === 0 ? (
                    <div className="py-12 text-center">
                        <div className="text-sm text-muted-foreground">
                            {t('holdingsEmpty')}
                        </div>
                    </div>
                ) : holdingsWithWeight.map(h => {
                    const isProfit = h.profit >= 0
                    const isEditing = editingId === h.id
                    const toBase = (v: number) => baseCurrency === 'KRW'
                        ? (h.currency === 'USD' ? v * exRate : v)
                        : (h.currency === 'USD' ? v : v / exRate)
                    const valueDisplay = toBase(h.currentValue)
                    const costDisplay = toBase(h.totalCost)
                    const profitDisplay = toBase(h.profit)
                    const profitText = profitDisplay >= 0
                        ? `+${formatCurrency(profitDisplay, baseCurrency)}`
                        : formatCurrency(profitDisplay, baseCurrency)

                    return (
                        <div
                            key={h.id}
                            className={cn(
                                'bg-card border border-border p-4',
                                isEditing && 'border-primary',
                            )}
                            style={{ borderLeftWidth: '3px', borderLeftColor: h.color }}
                        >
                            {/* Row 1: 종목명 (full) + overflow menu */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="font-serif text-[15px] font-semibold text-foreground leading-snug break-keep flex-1 min-w-0">
                                    {h.stockName}
                                </div>
                                {!isEditing && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                disabled={!!editingId || deletingId === h.id}
                                                className="-mt-1 -mr-2 p-2 text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0"
                                                aria-label={language === 'ko' ? '더보기' : 'More'}
                                            >
                                                {deletingId === h.id
                                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                                    : <MoreVertical className="w-4 h-4" />}
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="min-w-[140px]">
                                            <DropdownMenuItem
                                                onClick={() => startEdit(h)}
                                                className="cursor-pointer"
                                            >
                                                <Edit2 className="w-4 h-4 mr-2" /> {t('edit')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => handleDelete(h.id)}
                                                className="cursor-pointer text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" /> {t('delete')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>

                            {/* Row 2: 메타 (좌) + 평가금액·등락률 (우) */}
                            <div className="mt-1.5 flex items-end justify-between gap-3">
                                <div className="text-[10px] text-muted-foreground tracking-[0.5px] flex-1 min-w-0 space-y-0.5">
                                    <div>
                                        {h.stockCode} · {formatNumber(h.quantity)}{language === 'ko' ? '주' : 'shr'}
                                        {' · '}
                                        {language === 'ko' ? '평단 ' : 'avg '}
                                        {formatCurrency(h.averagePrice, h.currency)}
                                    </div>
                                    <div>
                                        {language === 'ko' ? `비중 ${h.weight.toFixed(1)}%` : `${h.weight.toFixed(1)}% wt`}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] numeric">
                                        {language === 'ko' ? '매입' : 'Cost'} {formatCurrency(costDisplay, baseCurrency)}
                                    </div>
                                    <div className="text-[14px] font-bold text-foreground numeric mt-0.5">
                                        {formatCurrency(valueDisplay, baseCurrency)}
                                    </div>
                                    <div className="mt-0.5 flex items-center justify-end gap-1.5">
                                        <UpDown value={h.profitRate} />
                                        <span className={cn(
                                            'text-[11px] font-semibold numeric',
                                            h.profit >= 0 ? 'text-profit' : 'text-loss',
                                        )}>
                                            {profitText}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Edit row */}
                            {isEditing ? (
                                <div className="mt-3 pt-3 border-t border-border space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <FormattedNumberInput
                                            label={t('quantity')}
                                            suffix={language === 'ko' ? '주' : 'shr'}
                                            value={editValues.quantity}
                                            onChange={v => setEditValues(p => ({ ...p, quantity: v }))}
                                            disabled={savingRow !== null}
                                        />
                                        <FormattedNumberInput
                                            label={t('averagePrice')}
                                            prefix={h.currency === 'KRW' ? '₩' : '$'}
                                            value={editValues.averagePrice}
                                            onChange={v => setEditValues(p => ({ ...p, averagePrice: v }))}
                                            disabled={savingRow !== null}
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={cancelEdit}
                                            disabled={savingRow !== null}
                                            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1"
                                        >
                                            <X className="w-3 h-3" /> {t('cancel')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => saveEdit(h.id)}
                                            disabled={savingRow !== null}
                                            className="bg-primary text-primary-foreground px-3 py-1 text-xs font-bold inline-flex items-center gap-1 hover:opacity-90"
                                        >
                                            {savingRow === h.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                            {t('save')}
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            {mounted && createPortal(
                <AddHoldingFloating
                    open={showAdd}
                    onOpenChange={handleDrawerChange}
                    newStock={newStock}
                    setNewStock={setNewStock}
                    newQty={newQty}
                    setNewQty={setNewQty}
                    newPrice={newPrice}
                    setNewPrice={setNewPrice}
                    adding={adding}
                    handleAdd={handleAdd}
                    t={t}
                    language={language}
                />,
                document.body,
            )}
        </div>
    )
}

interface AddHoldingFloatingProps {
    open: boolean
    onOpenChange: (next: boolean) => void
    newStock: any
    setNewStock: (s: any) => void
    newQty: string
    setNewQty: (s: string) => void
    newPrice: string
    setNewPrice: (s: string) => void
    adding: boolean
    handleAdd: () => void
    t: (key: any) => string
    language: 'ko' | 'en'
}

function AddHoldingFloating({
    open, onOpenChange,
    newStock, setNewStock,
    newQty, setNewQty,
    newPrice, setNewPrice,
    adding, handleAdd,
    t, language,
}: AddHoldingFloatingProps) {
    const isKR = newStock?.market === 'KOSPI' || newStock?.market === 'KOSDAQ'
    const pricePrefix = newStock ? (isKR ? '₩' : '$') : undefined
    const qtySuffix = language === 'ko' ? '주' : 'shr'

    return (
        <>
            {/* FAB — AI chat 위쪽에 위치 (탭바+gap+AiChat 높이+gap) */}
            <button
                type="button"
                onClick={() => onOpenChange(true)}
                aria-label={language === 'ko' ? '종목 추가' : 'Add holding'}
                className="fixed right-4 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all duration-150"
                style={{
                    bottom: 'calc(64px + 12px + var(--safe-bottom, 0px))',
                }}
            >
                <Plus className="w-5 h-5" strokeWidth={2.5} />
            </button>

            <Drawer.Root open={open} onOpenChange={onOpenChange}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
                    <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background border-t rounded-t-2xl outline-none">
                        <div className="flex justify-center pt-3 pb-1 shrink-0">
                            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                        </div>
                        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
                            <Drawer.Title className="font-semibold text-sm m-0">
                                {language === 'ko' ? '종목 추가' : 'Add holding'}
                            </Drawer.Title>
                            <Drawer.Description className="sr-only">
                                {language === 'ko' ? '검색하여 보유 종목을 추가합니다.' : 'Search and add a holding.'}
                            </Drawer.Description>
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="text-muted-foreground hover:text-foreground p-1"
                                aria-label={language === 'ko' ? '닫기' : 'Close'}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4 space-y-2.5 pb-[calc(1rem+var(--safe-bottom,0px))]">
                            <StockSearchCombobox
                                value={newStock?.stockName || ''}
                                onSelect={(s: any) => setNewStock(s)}
                                disabled={adding}
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <FormattedNumberInput
                                    label={t('quantity')}
                                    suffix={qtySuffix}
                                    value={newQty}
                                    onChange={setNewQty}
                                    disabled={adding}
                                />
                                <FormattedNumberInput
                                    label={t('averagePrice')}
                                    prefix={pricePrefix}
                                    value={newPrice}
                                    onChange={setNewPrice}
                                    disabled={adding}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAdd}
                                disabled={!newStock || !newQty || !newPrice || adding}
                                className="w-full bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 hover:opacity-90"
                            >
                                {adding ? t('addingProgress') : t('add')}
                            </button>
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        </>
    )
}

function SortToggle({
    active, dir, label, onClick,
}: {
    active: boolean
    dir: SortDir
    label: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'text-[11px] font-bold tracking-wide px-2 py-1 inline-flex items-center gap-0.5 transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
        >
            {label}
            {active && (dir === 'desc'
                ? <ArrowDown className="w-3 h-3" />
                : <ArrowUp className="w-3 h-3" />
            )}
        </button>
    )
}
