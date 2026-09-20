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
import { toPriceApiMarket, detectMarketCurrency } from '@/lib/utils/market-hours'
import {
    CashAccountEditor,
    type CashAccountRow,
    toEditorRows,
    fromEditorRows,
} from '@/components/dashboard/cash-account-editor'
import type { CashAccount } from '@/types/cash'

interface HoldingInput {
    stockName: string
    stockCode: string
    /** Stock.market 원본값 (KOSPI/KOSDAQ/NASD/NYSE/AMEX/LSE). 통화 판정과 시세 조회에 쓴다. */
    market: string
    quantity: string
    averagePrice: string
    currentPrice: string
    currency: 'KRW' | 'USD'
    purchaseRate: string
}

/**
 * 여러 종목의 가격을 배치 엔드포인트로 한 번에 조회한다 (stockCode → 가격).
 * 종목마다 요청을 따로 치면 ratelimit(10req/10s)에 걸려 일부만 채워진다.
 */
async function fetchPricesBatch(
    targets: Array<{ stockCode: string; market: string }>,
    date: string | null,
    signal: AbortSignal,
): Promise<Record<string, number>> {
    const out: Record<string, number> = {}
    if (targets.length === 0) return out

    const res = await fetch('/api/stocks/prices/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            date,
            items: targets.map((t) => ({
                symbol: t.stockCode,
                market: toPriceApiMarket(t.market, t.stockCode),
            })),
        }),
        signal,
    })
    const data = await res.json()
    if (!data?.success) return out

    for (const [code, price] of Object.entries(data.data.prices as Record<string, number | null>)) {
        if (typeof price === 'number' && price > 0) out[code] = price
    }
    return out
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
    // 해당 날짜 환율을 못 받아왔을 때 true — 폴백 상수로 조용히 저장되는 것을 막는다.
    const [rateUnavailable, setRateUnavailable] = useState(false)
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
                        stockCode: string
                        stock: { stockName: string; stockCode: string; nameKo?: string; market?: string }
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
                            stockName: h.stock.stockName ?? h.stock.nameKo ?? h.stock.stockCode,
                            stockCode: h.stock.stockCode,
                            market: h.stock.market ?? '',
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
            setRateUnavailable(false)
            try {
                // 1) 환율 — 과거 날짜면 그 날짜의 환율. 구버전은 /api/stocks/history?market=FX 를
                //    썼는데 KIS 로 교체된 뒤 KRW=X 를 못 찾아 항상 폴백 상수로 굳어졌다.
                let currentRate = FALLBACK_USD_RATE
                try {
                    const url = snapshotDate === today
                        ? '/api/exchange-rate'
                        : `/api/exchange-rate?date=${snapshotDate}`
                    const res = await fetch(url, { signal: controller.signal })
                    const data = await res.json()
                    if (controller.signal.aborted) return
                    if (data?.success && data?.rate) {
                        currentRate = data.rate
                    } else {
                        setRateUnavailable(true)
                    }
                } catch (e) {
                    if ((e as Error).name === 'AbortError') return
                    setRateUnavailable(true)
                }
                setExchangeRate(currentRate)

                // 2) 시세 — 배치 1회. 실패한 종목은 빈칸으로 두고 저장 시 명시적으로 알린다.
                const targets = holdings.filter((h) => h.stockCode)
                if (targets.length > 0) {
                    const priceByCode = await fetchPricesBatch(
                        targets,
                        snapshotDate === today ? null : snapshotDate,
                        controller.signal,
                    )
                    if (controller.signal.aborted) return

                    setHoldings((prev) => prev.map((h) => {
                        if (!h.stockCode) return h
                        const price = priceByCode[h.stockCode]
                        const currency = detectMarketCurrency(h.market, h.stockCode)
                        return {
                            ...h,
                            currentPrice: typeof price === 'number' ? price.toString() : '',
                            currency,
                            purchaseRate: currency === 'USD' ? currentRate.toString() : '1',
                        }
                    }))
                }
            } catch (e) {
                if ((e as Error).name === 'AbortError') return
                console.error('Failed to refresh snapshot data', e)
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
                stockName: '',
                stockCode: '',
                market: '',
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
        stock: { stockCode: string; nameKo: string; stockName?: string; market?: string }
    ) {
        const market = stock.market ?? ''
        // 통화는 즉시 확정. Stock.market 은 NASD/NYSE/AMEX 이므로 'US' 와 직접 비교하면
        // 미국 종목이 전부 KRW 로 기록된다 ($ 금액이 환산 없이 원화로 저장되는 사고).
        const newCurrency = detectMarketCurrency(market, stock.stockCode)
        const newPurchaseRate = newCurrency === 'USD' ? exchangeRate.toString() : '1'

        const updated = [...holdings]
        updated[index] = {
            ...updated[index],
            stockName: stock.stockName ?? stock.nameKo,
            stockCode: stock.stockCode,
            market,
            currency: newCurrency,
            purchaseRate: newPurchaseRate,
        }
        setHoldings(updated)

        const controller = new AbortController()
        stockSelectAbortsRef.current.add(controller)

        try {
            const priceByCode = await fetchPricesBatch(
                [{ stockCode: stock.stockCode, market }],
                snapshotDate === today ? null : snapshotDate,
                controller.signal,
            )
            const price = priceByCode[stock.stockCode]

            if (controller.signal.aborted) return

            setHoldings((prev) => {
                const current = [...prev]
                if (!current[index] || current[index].stockCode !== stock.stockCode) return prev
                current[index] = {
                    ...current[index],
                    currentPrice: typeof price === 'number' ? price.toString() : '',
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

        // 종목이 선택된 행은 전부 저장 대상. 값이 빈 행을 말없이 걸러내면
        // 사용자 모르게 종목이 사라진다 → 어떤 종목이 왜 빠지는지 알린다.
        const selected = holdings.filter((h) => h.stockCode)

        if (selected.length === 0) {
            setError(t('minHoldingsError'))
            return
        }

        const incomplete = selected.filter(
            (h) =>
                !(parseFloat(h.quantity) > 0) ||
                !(parseFloat(h.averagePrice) > 0) ||
                !(parseFloat(h.currentPrice) > 0),
        )

        if (incomplete.length > 0) {
            const names = incomplete.map((h) => h.stockName || h.stockCode).join(', ')
            setError(
                language === 'ko'
                    ? `${incomplete.length}개 종목의 수량·평단가·가격이 비어 있습니다: ${names}`
                    : `${incomplete.length} holding(s) missing quantity, average price, or price: ${names}`,
            )
            return
        }

        const validHoldings = selected

        setSaving(true)
        try {
            const cashAccountsPayload = fromEditorRows(cashRows, 'KRW', exchangeRate)
            const response = await snapshotsApi.update(params.id as string, {
                snapshotDate,
                exchangeRate,
                holdings: validHoldings.map((h) => ({
                    stockCode: h.stockCode,
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
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
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
                            <p className="text-[13px] font-medium text-muted-foreground">
                                {t('saving')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Hero — DOM structure mirrors detail page exactly: back link alone (mb-2), then title row with right-side action */}
                <section className="px-6 pt-3 pb-4">
                    <Link
                        href={`/dashboard/snapshots/${params.id}`}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2"
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
                            className="bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-bold disabled:opacity-50 hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 min-w-[72px] shrink-0"
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

                <section className="mx-4 mb-4 p-5 bg-card rounded-2xl">
                    <div className="text-[13px] font-medium text-muted-foreground">
                        {t('totalValue')}
                    </div>
                    <div className="amount-display text-[28px] text-foreground leading-none mt-1.5">
                        {formatCurrency(totals.totalValue, totals.currency)}
                    </div>

                    <div className="flex gap-4 mt-4 items-stretch">
                        <div className="flex-1">
                            <div className="text-[13px] font-medium text-muted-foreground">
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
                            <div className="text-[13px] font-medium text-muted-foreground">
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
                <section className="mx-4 mb-4 px-4 py-3 bg-card rounded-2xl">
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
                <section className="mx-4 mb-4 p-4 bg-card rounded-2xl">
                    <CashAccountEditor
                        accounts={cashRows}
                        onChange={setCashRows}
                        currency="KRW"
                        disabled={saving}
                    />
                </section>

                {/* Date card */}
                <section className="mx-4 mb-4 p-5 bg-card rounded-2xl">
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
                            {rateUnavailable && (
                                <span className="ml-1.5 font-medium text-muted-foreground">
                                    ({language === 'ko' ? '조회 실패, 기본값' : 'fallback'})
                                </span>
                            )}
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
                                className="bg-card rounded-2xl p-4"
                                style={{
                                    borderLeftWidth: '3px',
                                    borderLeftColor: holding.stockCode ? 'var(--primary)' : 'var(--border)',
                                }}
                            >
                                <div className="flex items-center justify-between mb-2.5">
                                    <span className="text-[13px] font-medium text-muted-foreground">
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

                                {holding.stockCode && (holding.currentPrice ? (
                                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                                        <span className="text-muted-foreground">{priceLabel}</span>
                                        <span className="font-bold text-foreground numeric">
                                            {formatCurrency(parseFloat(holding.currentPrice) || 0, holding.currency)}
                                        </span>
                                    </div>
                                ) : (
                                    /* 시세 조회 실패 — 빈 채로 두면 저장 시 이 종목이 빠진다. 직접 입력받는다. */
                                    <div className="mt-2">
                                        <FormattedNumberInput
                                            label={`${priceLabel} · ${language === 'ko' ? '조회 실패, 직접 입력' : 'not found, enter manually'}`}
                                            prefix={holding.currency === 'USD' ? '$' : '₩'}
                                            value={holding.currentPrice}
                                            disabled={saving}
                                            onChange={(val) => updateHolding(index, 'currentPrice', val)}
                                        />
                                    </div>
                                ))}

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
