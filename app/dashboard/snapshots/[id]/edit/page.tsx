'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2, Plus, Trash2 } from 'lucide-react'

import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { snapshotsApi } from '@/lib/api/client'
import { formatCurrency } from '@/lib/utils/formatters'
import { useLanguage } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import {
    CashAccountEditor,
    type CashAccountRow,
    toEditorRows,
    fromEditorRows,
} from '@/components/dashboard/cash-account-editor'
import type { CashAccount } from '@/types/cash'

interface HoldingInput {
    stockId: string
    stockName: string
    stockCode: string
    quantity: string
    averagePrice: string
    currentPrice: string
    currency: 'KRW' | 'USD'
    purchaseRate: string
}

export default function EditSnapshotPage() {
    const { t, language } = useLanguage()
    const router = useRouter()
    const params = useParams()

    const today = new Date().toISOString().split('T')[0]
    const [snapshotDate, setSnapshotDate] = useState<string>(today)
    const [holdings, setHoldings] = useState<HoldingInput[]>([])
    // 예수금: snapshot.cashAccounts 가 있으면 그대로 시드, 없으면 cashBalance 1행 fallback (legacy 호환).
    const [cashRows, setCashRows] = useState<CashAccountRow[]>([])
    const [note, setNote] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [updatingPrices, setUpdatingPrices] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [summaryDisplayCurrency, setSummaryDisplayCurrency] = useState<'KRW' | 'USD'>('KRW')
    const [exchangeRate, setExchangeRate] = useState<number>(FALLBACK_USD_RATE)
    const loadedDateRef = useRef<string | null>(null)

    // Abort controllers — cancel in-flight fetches on unmount (e.g., tab nav) and on supersession
    const initialFetchAbortRef = useRef<AbortController | null>(null)
    const dateChangeAbortRef = useRef<AbortController | null>(null)
    const stockSelectAbortsRef = useRef<Set<AbortController>>(new Set())

    useEffect(() => () => {
        initialFetchAbortRef.current?.abort()
        dateChangeAbortRef.current?.abort()
        stockSelectAbortsRef.current.forEach(c => c.abort())
        stockSelectAbortsRef.current.clear()
    }, [])

    useEffect(() => {
        setSummaryDisplayCurrency(language === 'en' ? 'USD' : 'KRW')
    }, [language])

    useEffect(() => {
        if (!params.id) return
        const controller = new AbortController()
        initialFetchAbortRef.current = controller

        async function fetchSnapshot() {
            try {
                const response = await snapshotsApi.getDetail(params.id as string, controller.signal)
                if (controller.signal.aborted) return
                if (response.success && response.data) {
                    const snapshot = response.data
                    const stored = (snapshot.cashAccounts as CashAccount[] | null | undefined) ?? null
                    if (stored && stored.length > 0) {
                        setCashRows(toEditorRows(stored, 'KRW', Number(snapshot.exchangeRate) || FALLBACK_USD_RATE))
                    } else if (Number(snapshot.cashBalance) > 0) {
                        // legacy: 분해 없는 기존 스냅샷 — 합계를 단일 행으로 표시.
                        setCashRows(toEditorRows(
                            [{ id: 'legacy-seed', label: language === 'ko' ? '예수금' : 'Cash', amount: snapshot.cashBalance.toString() }],
                            'KRW',
                            Number(snapshot.exchangeRate) || FALLBACK_USD_RATE,
                        ))
                    } else {
                        setCashRows([])
                    }
                    setNote(snapshot.note || '')
                    setExchangeRate(Number(snapshot.exchangeRate) || FALLBACK_USD_RATE)

                    const dateStr = snapshot.snapshotDate
                        ? new Date(snapshot.snapshotDate).toISOString().split('T')[0]
                        : today
                    loadedDateRef.current = dateStr
                    setSnapshotDate(dateStr)

                    const mappedHoldings = snapshot.holdings.map((h: {
                        stockId: string
                        stock: { stockName: string; stockCode: string }
                        quantity: number | string
                        averagePrice: number | string
                        currentPrice: number | string
                        currency?: 'KRW' | 'USD'
                        purchaseRate?: number | string | null
                    }) => {
                        const currency = h.currency || 'KRW'
                        let purchaseRate = h.purchaseRate ? h.purchaseRate.toString() : '1'
                        if (currency === 'USD' && purchaseRate === '1') {
                            purchaseRate = String(FALLBACK_USD_RATE)
                        }
                        return {
                            stockId: h.stockId,
                            stockName: h.stock.stockName,
                            stockCode: h.stock.stockCode,
                            quantity: h.quantity.toString(),
                            averagePrice: h.averagePrice.toString(),
                            currentPrice: h.currentPrice.toString(),
                            currency,
                            purchaseRate,
                        }
                    })

                    setHoldings(mappedHoldings)
                } else {
                    setError(response.error?.message || t('loadFailed'))
                }
            } catch (e) {
                if ((e as Error).name === 'AbortError') return
                setError(t('networkError'))
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        fetchSnapshot()
    }, [params.id, today, t])

    useEffect(() => {
        if (snapshotDate === loadedDateRef.current) return

        // Cancel any previous in-flight date-change refresh
        dateChangeAbortRef.current?.abort()
        const controller = new AbortController()
        dateChangeAbortRef.current = controller

        async function updateData() {
            setUpdatingPrices(true)
            try {
                if (snapshotDate === today) {
                    if (!controller.signal.aborted) setExchangeRate(FALLBACK_USD_RATE)
                } else {
                    try {
                        const res = await fetch(`/api/stocks/history?symbol=KRW=X&market=FX&date=${snapshotDate}`, { signal: controller.signal })
                        const data = await res.json()
                        if (controller.signal.aborted) return
                        setExchangeRate(data?.success && data?.data?.close ? data.data.close : FALLBACK_USD_RATE)
                    } catch (e) {
                        if ((e as Error).name === 'AbortError') return
                        setExchangeRate(FALLBACK_USD_RATE)
                    }
                }

                if (holdings.length > 0 && !(holdings.length === 1 && !holdings[0].stockId)) {
                    const updatedHoldings = await Promise.all(holdings.map(async (h) => {
                        if (!h.stockCode) return h
                        const market = isNaN(Number(h.stockCode)) ? 'US' : 'KOSPI'
                        let price = h.currentPrice
                        try {
                            if (snapshotDate === today) {
                                const res = await fetch(`/api/kis/price?symbol=${h.stockCode}&market=${market}`, { signal: controller.signal })
                                const data = await res.json()
                                if (data?.success && data?.data?.price) price = data.data.price.toString()
                            } else {
                                const res = await fetch(`/api/stocks/history?symbol=${h.stockCode}&market=${market}&date=${snapshotDate}`, { signal: controller.signal })
                                const data = await res.json()
                                if (data?.success && data?.data?.close) price = data.data.close.toString()
                            }
                        } catch (e) {
                            if ((e as Error).name === 'AbortError') return h
                            console.error(`Failed to update price for ${h.stockCode}`, e)
                        }
                        return { ...h, currentPrice: price }
                    }))
                    if (controller.signal.aborted) return
                    setHoldings(updatedHoldings)
                }
            } finally {
                if (!controller.signal.aborted) setUpdatingPrices(false)
            }
        }

        updateData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshotDate])

    function addHolding() {
        setHoldings([
            ...holdings,
            {
                stockId: '',
                stockName: '',
                stockCode: '',
                quantity: '',
                averagePrice: '',
                currentPrice: '',
                currency: 'KRW',
                purchaseRate: '1',
            },
        ])
    }

    function removeHolding(index: number) {
        if (holdings.length === 1) return
        setHoldings(holdings.filter((_, i) => i !== index))
    }

    function updateHolding(index: number, field: keyof HoldingInput, value: string) {
        const updated = [...holdings]
        updated[index] = { ...updated[index], [field]: value }
        setHoldings(updated)
    }

    async function handleStockSelect(
        index: number,
        stock: { id: string; stockName: string; stockCode: string; market?: string }
    ) {
        const updated = [...holdings]
        updated[index] = {
            ...updated[index],
            stockId: stock.id,
            stockName: stock.stockName,
            stockCode: stock.stockCode,
        }
        setHoldings(updated)

        const controller = new AbortController()
        stockSelectAbortsRef.current.add(controller)

        try {
            const market = stock.market || (isNaN(Number(stock.stockCode)) ? 'US' : 'KOSPI')
            const newCurrency = market === 'US' ? 'USD' : 'KRW'
            const newPurchaseRate = market === 'US' ? exchangeRate.toString() : '1'

            let price = '0'
            if (snapshotDate === today) {
                const res = await fetch(`/api/kis/price?symbol=${stock.stockCode}&market=${market}`, { signal: controller.signal })
                const data = await res.json()
                if (data?.success && data?.data?.price) price = data.data.price.toString()
            } else {
                const res = await fetch(`/api/stocks/history?symbol=${stock.stockCode}&market=${market}&date=${snapshotDate}`, { signal: controller.signal })
                const data = await res.json()
                if (data?.success && data?.data?.close) price = data.data.close.toString()
            }

            if (controller.signal.aborted) return

            setHoldings((prev) => {
                const current = [...prev]
                if (!current[index] || current[index].stockId !== stock.id) return prev
                current[index] = {
                    ...current[index],
                    currentPrice: price === '0' ? current[index].currentPrice : price,
                    currency: newCurrency,
                    purchaseRate: newPurchaseRate,
                }
                return current
            })
        } catch (e) {
            if ((e as Error).name === 'AbortError') return
            console.error('Failed to fetch price:', e)
        } finally {
            stockSelectAbortsRef.current.delete(controller)
        }
    }

    function calculateTotals(displayCurrency: 'KRW' | 'USD') {
        let totalCost = 0
        let totalValue = 0
        holdings.forEach((h) => {
            const qty = parseFloat(h.quantity) || 0
            const avg = parseFloat(h.averagePrice) || 0
            const curr = parseFloat(h.currentPrice) || 0
            const pRate = parseFloat(h.purchaseRate) || 1
            if (displayCurrency === 'USD') {
                if (h.currency === 'USD') {
                    totalCost += qty * avg
                    totalValue += qty * curr
                } else {
                    totalCost += (qty * avg) / exchangeRate
                    totalValue += (qty * curr) / exchangeRate
                }
            } else {
                if (h.currency === 'USD') {
                    totalCost += qty * avg * pRate
                    totalValue += qty * curr * exchangeRate
                } else {
                    totalCost += qty * avg
                    totalValue += qty * curr
                }
            }
        })
        const profit = totalValue - totalCost
        const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0
        return { totalCost, totalValue, profit, profitRate, currency: displayCurrency }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        const validHoldings = holdings.filter(
            (h) =>
                h.stockId &&
                parseFloat(h.quantity) > 0 &&
                parseFloat(h.averagePrice) > 0 &&
                parseFloat(h.currentPrice) > 0,
        )

        if (validHoldings.length === 0) {
            setError(t('minHoldingsError'))
            return
        }

        setSaving(true)
        try {
            const cashAccountsPayload = fromEditorRows(cashRows, 'KRW', exchangeRate)
            const response = await snapshotsApi.update(params.id as string, {
                snapshotDate,
                exchangeRate,
                holdings: validHoldings.map((h) => ({
                    stockId: h.stockId,
                    quantity: parseInt(h.quantity),
                    averagePrice: parseFloat(h.averagePrice),
                    currentPrice: parseFloat(h.currentPrice),
                    currency: h.currency,
                    purchaseRate: parseFloat(h.purchaseRate),
                })),
                cashAccounts: cashAccountsPayload,
                note: note || undefined,
            })

            if (response.success) {
                router.push(`/dashboard/snapshots/${params.id}`)
            } else {
                setError(response.error?.message || t('updateFailed'))
                setSaving(false)
            }
        } catch {
            setError(t('networkError'))
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="max-w-[420px] md:max-w-2xl mx-auto w-full">
                <div className="flex h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center gap-4">
                    <div className="w-64 max-w-full">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div className="h-full bg-primary animate-indeterminate rounded-full" />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (error && !holdings.length) {
        return (
            <div className="max-w-[420px] md:max-w-2xl mx-auto w-full px-6 pt-12 text-center">
                <p className="text-loss text-[13px] mb-4">{error}</p>
                <Link
                    href="/dashboard/snapshots"
                    className="inline-flex items-center gap-1 text-[11px] font-bold tracking-[1.5px] uppercase text-primary hover:underline"
                >
                    <ChevronLeft className="w-3 h-3" />
                    {t('backToList')}
                </Link>
            </div>
        )
    }

    const totals = calculateTotals(summaryDisplayCurrency)
    const isProfit = totals.profit >= 0
    const isHistorical = snapshotDate !== today

    return (
        <div className="max-w-[420px] md:max-w-2xl mx-auto w-full pb-8">
            <form onSubmit={handleSubmit} className="relative">
                {saving && (
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-9 h-9 animate-spin text-primary" />
                            <p className="text-xs font-bold tracking-[1px] uppercase text-muted-foreground">
                                {t('saving')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Hero — DOM structure mirrors detail page exactly: back link alone (mb-2), then title row with right-side action */}
                <section className="px-6 pt-3 pb-4">
                    <Link
                        href={`/dashboard/snapshots/${params.id}`}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tracking-[0.5px] hover:text-foreground transition-colors mb-2"
                    >
                        <ChevronLeft className="w-3 h-3" />
                        {t('cancel')}
                    </Link>
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="hero-serif text-[32px] text-foreground leading-tight">
                                {t('editSnapshot')}
                            </h1>
                            <span className="serif-italic text-xs text-muted-foreground block mt-1">
                                {language === 'ko'
                                    ? '기록을 다시 검토하고 다듬으세요.'
                                    : 'Revisit and refine this snapshot.'}
                            </span>
                        </div>
                        <button
                            type="submit"
                            disabled={saving || updatingPrices}
                            className="bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-bold tracking-[0.5px] disabled:opacity-50 hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 min-w-[72px] shrink-0"
                        >
                            {saving || updatingPrices
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : t('saveChanges')}
                        </button>
                    </div>
                </section>

                {/* Inline error */}
                {error && (
                    <div className="mx-4 mb-4 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-[12px]">
                        {error}
                    </div>
                )}

                {/* Summary — moved to top so the current state is visible immediately on entry */}
                <div className="px-6 pb-3 flex items-center justify-between gap-2">
                    <span className="eyebrow">{t('summary')}</span>
                    <div className="inline-flex items-center border border-border">
                        <button
                            type="button"
                            onClick={() => setSummaryDisplayCurrency('KRW')}
                            disabled={saving}
                            className={cn(
                                'text-[10px] font-bold tracking-wide px-2.5 py-1 transition-colors disabled:opacity-50',
                                summaryDisplayCurrency === 'KRW'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            ₩ KRW
                        </button>
                        <button
                            type="button"
                            onClick={() => setSummaryDisplayCurrency('USD')}
                            disabled={saving}
                            className={cn(
                                'text-[10px] font-bold tracking-wide px-2.5 py-1 transition-colors disabled:opacity-50',
                                summaryDisplayCurrency === 'USD'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            $ USD
                        </button>
                    </div>
                </div>

                <section className="mx-4 mb-4 p-5 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {t('totalValue')}
                    </div>
                    <div className="amount-display text-[28px] text-foreground leading-none mt-1.5">
                        {formatCurrency(totals.totalValue, totals.currency)}
                    </div>

                    <div className="flex gap-4 mt-4 items-stretch">
                        <div className="flex-1">
                            <div className="text-[10px] font-bold text-muted-foreground tracking-[0.5px] uppercase">
                                {t('returnRate')}
                            </div>
                            <div
                                className={cn(
                                    'text-[15px] font-bold mt-1 numeric inline-flex items-center gap-0.5',
                                    isProfit ? 'text-profit' : 'text-loss',
                                )}
                            >
                                <span aria-hidden>{isProfit ? '▲' : '▼'}</span>
                                <span>{Math.abs(totals.profitRate).toFixed(2)}%</span>
                            </div>
                        </div>
                        <div className="w-px bg-border self-stretch" />
                        <div className="flex-1">
                            <div className="text-[10px] font-bold text-muted-foreground tracking-[0.5px] uppercase">
                                {t('pl')}
                            </div>
                            <div
                                className={cn(
                                    'text-[15px] font-bold mt-1 numeric',
                                    isProfit ? 'text-profit' : 'text-loss',
                                )}
                            >
                                {isProfit ? '+' : '-'}{formatCurrency(Math.abs(totals.profit), totals.currency)}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{t('totalInvested')}</span>
                        <span className="font-bold text-foreground numeric">
                            {formatCurrency(totals.totalCost, totals.currency)}
                        </span>
                    </div>
                </section>

                {/* Memo — compact, above the editing area */}
                <div className="px-6 pb-3">
                    <span className="eyebrow">{t('memo')}</span>
                </div>
                <section className="mx-4 mb-4 px-4 py-3 bg-card border border-border">
                    <input
                        id="note"
                        type="text"
                        placeholder={t('memoPlaceholder')}
                        value={note}
                        disabled={saving}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full bg-transparent font-serif text-base md:text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                </section>

                {/* Cash accounts — 계좌별 예수금 편집. 합계는 에디터 하단에 자동 표시. */}
                <div className="px-6 pb-3">
                    <span className="eyebrow">{t('cash')}</span>
                </div>
                <section className="mx-4 mb-4 p-4 bg-card border border-border">
                    <CashAccountEditor
                        accounts={cashRows}
                        onChange={setCashRows}
                        currency="KRW"
                        disabled={saving}
                    />
                </section>

                {/* Date card */}
                <section className="mx-4 mb-4 p-5 bg-card border border-border relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary" />
                    <div className="eyebrow mb-2">
                        {t('snapshotDate')}
                    </div>
                    <input
                        type="date"
                        max={today}
                        value={snapshotDate}
                        disabled={saving}
                        onChange={(e) => {
                            loadedDateRef.current = null
                            setSnapshotDate(e.target.value)
                        }}
                        className="w-full bg-transparent font-serif text-[22px] font-semibold text-foreground numeric outline-none border-b border-border pb-1.5 focus:border-primary transition-colors"
                    />
                    <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">
                            {t('exchangeRate')}
                        </span>
                        <span className="text-[12px] font-bold text-foreground numeric">
                            {formatCurrency(exchangeRate, 'KRW')} / USD
                        </span>
                    </div>
                    {isHistorical && (
                        <div className="mt-3 pt-3 border-t border-border text-[11px] text-primary leading-relaxed">
                            {t('historicalMode')}
                        </div>
                    )}
                </section>

                {/* Holdings header */}
                <div className="px-6 pb-3 flex justify-between items-center gap-2">
                    <span className="eyebrow">
                        {t('holdings')} · {holdings.length}
                    </span>
                    <button
                        type="button"
                        onClick={addHolding}
                        disabled={saving}
                        className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wide text-primary px-2 py-1 hover:bg-accent-soft transition-colors disabled:opacity-50"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {t('addStock')}
                    </button>
                </div>

                {/* Holdings list */}
                <div className="px-4 pb-4 space-y-2">
                    {holdings.map((holding, index) => {
                        const isUS = holding.currency === 'USD'
                        const priceLabel = snapshotDate === today
                            ? t('currentPrice')
                            : `${snapshotDate} ${t('closingPrice')}`
                        return (
                            <div
                                key={index}
                                className="bg-card border border-border p-4"
                                style={{
                                    borderLeftWidth: '3px',
                                    borderLeftColor: holding.stockId ? 'var(--primary)' : 'var(--border)',
                                }}
                            >
                                <div className="flex items-center justify-between mb-2.5">
                                    <span className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                                        {language === 'ko' ? `종목 ${index + 1}` : `Stock ${index + 1}`}
                                    </span>
                                    {holdings.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeHolding(index)}
                                            disabled={saving}
                                            className="p-1 -mr-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                                            aria-label={t('delete')}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                <StockSearchCombobox
                                    value={holding.stockName ? `${holding.stockName} (${holding.stockCode})` : ''}
                                    onSelect={(stock) => handleStockSelect(index, stock)}
                                    disabled={saving}
                                />

                                {holding.stockCode && (
                                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                                        <span className="text-muted-foreground">{priceLabel}</span>
                                        <span className="font-bold text-foreground numeric">
                                            {formatCurrency(parseFloat(holding.currentPrice) || 0, holding.currency)}
                                        </span>
                                    </div>
                                )}

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <FormattedNumberInput
                                        label={t('quantity')}
                                        suffix={language === 'ko' ? '주' : 'shr'}
                                        value={holding.quantity}
                                        disabled={saving}
                                        onChange={(val) => updateHolding(index, 'quantity', val)}
                                    />
                                    <FormattedNumberInput
                                        label={t('avgPrice')}
                                        prefix={isUS ? '$' : '₩'}
                                        value={holding.averagePrice}
                                        disabled={saving}
                                        onChange={(val) => updateHolding(index, 'averagePrice', val)}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>

            </form>
        </div>
    )
}
