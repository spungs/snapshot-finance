'use client'

import { useState, useCallback, useMemo } from 'react'
import { holdingsApi } from '@/lib/api/client'
import { formatCurrency, formatNumber, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { DonutChart } from '@/components/dashboard/donut-chart'
import { Plus, Edit2, Trash2, Check, X, Loader2, ArrowUp, ArrowDown } from 'lucide-react'

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

type SortKey = 'currentValue' | 'totalCost'
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

    // Add form
    const [newStock, setNewStock] = useState<any>(null)
    const [newQty, setNewQty] = useState('')
    const [newPrice, setNewPrice] = useState('')
    const [adding, setAdding] = useState(false)
    const [showAdd, setShowAdd] = useState(false)

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
                <div className="eyebrow mb-1">
                    {language === 'ko' ? '현재 보유 자산' : 'Current Holdings'}
                </div>
                <h1 className="hero-serif text-[32px] text-foreground">
                    {t('tabPortfolio')}
                </h1>
            </section>

            {/* Donut + legend */}
            {holdings.length > 0 && (
                <section className="mx-4 mb-4 p-6 bg-card border border-border">
                    <div className="flex items-center justify-center mb-3.5">
                        <div className="relative">
                            <DonutChart data={donutSegments} size={150} thickness={20} />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <div className="text-[10px] text-muted-foreground tracking-[1px] uppercase">
                                    {t('totalValue')}
                                </div>
                                <div className="font-serif text-[17px] font-semibold text-foreground numeric">
                                    {formatCurrency(displayTotal, baseCurrency)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {donutSegments.slice(0, 6).map(seg => {
                            const w = (seg.value / (currentSummary.totalValue || 1)) * 100
                            return (
                                <div key={seg.holding.id} className="flex items-center gap-2 min-w-0">
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
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Holdings header — count + add + sort */}
            <div className="px-6 pb-3 flex justify-between items-center gap-2">
                <span className="eyebrow">
                    {language === 'ko' ? '보유 종목' : 'Holdings'} · {holdings.length}
                </span>
                <div className="flex items-center gap-2">
                    <SortToggle
                        active={sortKey === 'currentValue'}
                        dir={sortDir}
                        label={language === 'ko' ? '평가금액' : 'Value'}
                        onClick={() => handleSort('currentValue')}
                    />
                    <SortToggle
                        active={sortKey === 'totalCost'}
                        dir={sortDir}
                        label={language === 'ko' ? '매입금액' : 'Cost'}
                        onClick={() => handleSort('totalCost')}
                    />
                    <button
                        type="button"
                        onClick={() => setShowAdd(s => !s)}
                        className="bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1 hover:opacity-90"
                    >
                        <Plus className="w-3 h-3" strokeWidth={3} />
                        {showAdd ? t('cancel') : t('add')}
                    </button>
                </div>
            </div>

            {/* Add form */}
            {showAdd && (
                <div className="mx-4 mb-3 p-4 bg-card border border-border space-y-2.5">
                    <StockSearchCombobox
                        value={newStock?.stockName || ''}
                        onSelect={(s: any) => setNewStock(s)}
                        disabled={adding}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <FormattedNumberInput
                            placeholder={t('quantity')}
                            value={newQty}
                            onChange={setNewQty}
                            disabled={adding}
                        />
                        <FormattedNumberInput
                            placeholder={t('averagePrice')}
                            value={newPrice}
                            onChange={setNewPrice}
                            disabled={adding}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={!newStock || !newQty || !newPrice || adding}
                        className="w-full bg-primary text-primary-foreground py-2.5 text-sm font-bold disabled:opacity-50 hover:opacity-90"
                    >
                        {adding ? t('addingProgress') : t('add')}
                    </button>
                </div>
            )}

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
                    const valueDisplay = baseCurrency === 'KRW'
                        ? (h.currency === 'USD' ? h.currentValue * exRate : h.currentValue)
                        : (h.currency === 'USD' ? h.currentValue : h.currentValue / exRate)

                    return (
                        <div
                            key={h.id}
                            className={cn(
                                'bg-card border border-border p-4',
                                isEditing && 'border-primary',
                            )}
                            style={{ borderLeftWidth: '3px', borderLeftColor: h.color }}
                        >
                            <div className="flex justify-between items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="font-serif text-[15px] font-semibold text-foreground truncate">
                                        {h.stockName}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-0.5">
                                        {h.stockCode} · {formatNumber(h.quantity)}{language === 'ko' ? '주' : 'shr'}
                                        {' · '}
                                        {language === 'ko' ? '평단 ' : 'avg '}
                                        {formatCurrency(h.averagePrice, h.currency)}
                                        {' · '}
                                        {h.weight.toFixed(1)}%
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-[14px] font-bold text-foreground numeric">
                                        {formatCurrency(valueDisplay, baseCurrency)}
                                    </div>
                                    <div className="mt-0.5"><UpDown value={h.profitRate} /></div>
                                </div>
                            </div>

                            {/* Edit row */}
                            {isEditing ? (
                                <div className="mt-3 pt-3 border-t border-border space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <FormattedNumberInput
                                            value={editValues.quantity}
                                            onChange={v => setEditValues(p => ({ ...p, quantity: v }))}
                                            disabled={savingRow !== null}
                                        />
                                        <FormattedNumberInput
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
                            ) : (
                                <div className="mt-2 pt-2 border-t border-border/60 flex justify-end gap-3 text-[11px]">
                                    <button
                                        type="button"
                                        onClick={() => startEdit(h)}
                                        disabled={!!editingId || deletingId === h.id}
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-50 inline-flex items-center gap-1"
                                    >
                                        <Edit2 className="w-3 h-3" /> {t('edit')}
                                    </button>
                                    <span className="text-border">|</span>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(h.id)}
                                        disabled={!!editingId || deletingId === h.id}
                                        className="text-muted-foreground hover:text-destructive disabled:opacity-50 inline-flex items-center gap-1"
                                    >
                                        {deletingId === h.id
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : <Trash2 className="w-3 h-3" />}
                                        {t('delete')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
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
