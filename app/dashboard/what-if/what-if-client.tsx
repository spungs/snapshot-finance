'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceDot,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { useLanguage } from '@/lib/i18n/context'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'

interface Stock {
    id: string
    stockCode: string
    stockName: string
    engName?: string
    market?: string
}

interface ChartData {
    date: string
    close: number
    open: number
    high: number
    low: number
    volume: number
}

const PROFIT_COLOR = 'var(--profit)'
const LOSS_COLOR = 'var(--loss)'

function isUSMarket(market?: string) {
    return market === 'US' || market === 'NAS' || market === 'NYS' || market === 'NASD' || market === 'NYSE' || market === 'AMEX'
}

// Strip non-numeric chars then re-insert thousand separators on the integer side.
// Preserves a single decimal point and up to 2 decimal digits.
function formatAmountInput(raw: string): string {
    const cleaned = raw.replace(/[^\d.]/g, '')
    if (!cleaned) return ''
    const [intPart, ...decParts] = cleaned.split('.')
    const formattedInt = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    if (cleaned.includes('.')) {
        const dec = decParts.join('').slice(0, 2)
        return formattedInt + '.' + dec
    }
    return formattedInt
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

export function WhatIfClient() {
    const { t, language } = useLanguage()

    const defaultDateStr = React.useMemo(() => {
        const d = new Date()
        d.setFullYear(d.getFullYear() - 1)
        return format(d, 'yyyy-MM-dd')
    }, [])

    const [selectedStock, setSelectedStock] = React.useState<Stock | null>(null)
    const [dateInput, setDateInput] = React.useState<string>(defaultDateStr)
    const [amountInput, setAmountInput] = React.useState<string>('')
    const [amountCurrency, setAmountCurrency] = React.useState<'KRW' | 'USD'>('KRW')

    const [chartData, setChartData] = React.useState<ChartData[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [exchangeRate, setExchangeRate] = React.useState<number>(FALLBACK_USD_RATE)
    const [appliedQuery, setAppliedQuery] = React.useState<{
        stock: Stock
        startDate: string
    } | null>(null)

    // Fetch USD/KRW exchange rate once on mount
    React.useEffect(() => {
        let cancelled = false
        fetch('/api/exchange-rate')
            .then(r => r.json())
            .then(d => {
                if (!cancelled && d?.success && typeof d.rate === 'number') {
                    setExchangeRate(d.rate)
                }
            })
            .catch(() => { /* keep default */ })
        return () => { cancelled = true }
    }, [])

    // Sync amount currency to stock currency when stock changes (one-time per stock)
    React.useEffect(() => {
        if (selectedStock) {
            setAmountCurrency(isUSMarket(selectedStock.market) ? 'USD' : 'KRW')
        }
    }, [selectedStock])

    const isUS = isUSMarket(selectedStock?.market)
    const stockCurrency: 'KRW' | 'USD' = isUS ? 'USD' : 'KRW'

    const fmtMoney = React.useCallback((value: number, currency: 'KRW' | 'USD', opts?: { compact?: boolean; integer?: boolean }) => {
        const fractionDigits = opts?.integer ? 0 : (currency === 'USD' ? 2 : 0)
        return new Intl.NumberFormat(language === 'ko' ? 'ko-KR' : 'en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
            notation: opts?.compact ? 'compact' : 'standard',
        }).format(value)
    }, [language])

    const handleRunQuery = React.useCallback(async () => {
        if (!selectedStock || !dateInput) return
        const d = new Date(dateInput)
        if (isNaN(d.getTime()) || d.getFullYear() < 1970) {
            setError(t('whatIfNoData'))
            return
        }

        setLoading(true)
        setError(null)

        try {
            const endDate = new Date().toISOString().split('T')[0]
            const query = new URLSearchParams({
                symbol: selectedStock.stockCode,
                market: selectedStock.market || 'KOSPI',
                startDate: dateInput,
                endDate: endDate,
            })

            const res = await fetch(`/api/stocks/chart?${query.toString()}`)
            const data = await res.json()

            if (data.success) {
                if (!data.data || data.data.length === 0) {
                    setError(t('whatIfNoData'))
                    setChartData([])
                    setAppliedQuery(null)
                } else {
                    setChartData(data.data)
                    const actualStartDate = data.data[0].date
                    setAppliedQuery({ stock: selectedStock, startDate: actualStartDate })
                    if (actualStartDate !== dateInput) {
                        setDateInput(actualStartDate)
                    }
                }
            } else {
                setError(data.error?.message || t('whatIfNoData'))
                setChartData([])
                setAppliedQuery(null)
            }
        } catch {
            setError(t('networkError'))
            setAppliedQuery(null)
        } finally {
            setLoading(false)
        }
    }, [selectedStock, dateInput, t])

    const firstPrice = chartData.length > 0 ? chartData[0].close : 0
    const lastPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : 0
    const profitRate = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0
    const isProfit = profitRate >= 0

    const parsedAmount = React.useMemo(() => {
        const cleaned = amountInput.replace(/[^0-9.]/g, '')
        const n = parseFloat(cleaned)
        return isNaN(n) || n <= 0 ? 0 : n
    }, [amountInput])

    // Convert input amount → stock currency for shares calculation
    const amountInStockCurrency = React.useMemo(() => {
        if (parsedAmount <= 0) return 0
        if (amountCurrency === stockCurrency) return parsedAmount
        // KRW input but USD stock → divide
        if (amountCurrency === 'KRW' && stockCurrency === 'USD') return parsedAmount / exchangeRate
        // USD input but KRW stock → multiply
        return parsedAmount * exchangeRate
    }, [parsedAmount, amountCurrency, stockCurrency, exchangeRate])

    const hasAmount = amountInStockCurrency > 0 && firstPrice > 0
    const sharesAcquired = hasAmount ? amountInStockCurrency / firstPrice : 0
    const todayValueStock = hasAmount ? sharesAcquired * lastPrice : 0

    // Convert results back to user's chosen amount currency for display
    const todayValueDisplay = React.useMemo(() => {
        if (!hasAmount) return 0
        if (amountCurrency === stockCurrency) return todayValueStock
        if (amountCurrency === 'KRW' && stockCurrency === 'USD') return todayValueStock * exchangeRate
        return todayValueStock / exchangeRate
    }, [todayValueStock, amountCurrency, stockCurrency, exchangeRate, hasAmount])

    const absoluteProfit = hasAmount ? todayValueDisplay - parsedAmount : 0

    const insights = React.useMemo(() => {
        if (chartData.length < 2) return null
        let bestIdx = 0
        let worstIdx = 0
        for (let i = 1; i < chartData.length; i++) {
            if (chartData[i].close < chartData[bestIdx].close) bestIdx = i
            if (chartData[i].close > chartData[worstIdx].close) worstIdx = i
        }
        let peak = chartData[0].close
        let mddPct = 0
        let mddIdx = 0
        for (let i = 0; i < chartData.length; i++) {
            if (chartData[i].close > peak) peak = chartData[i].close
            const dd = (chartData[i].close - peak) / peak
            if (dd < mddPct) {
                mddPct = dd
                mddIdx = i
            }
        }
        return {
            best: { date: chartData[bestIdx].date, price: chartData[bestIdx].close },
            worst: { date: chartData[worstIdx].date, price: chartData[worstIdx].close },
            mdd: { date: chartData[mddIdx].date, pct: mddPct * 100 },
        }
    }, [chartData])

    const areaColor = isProfit ? PROFIT_COLOR : LOSS_COLOR
    const stockDisplayName = selectedStock
        ? (language === 'ko' ? selectedStock.stockName : (selectedStock.engName || selectedStock.stockName))
        : ''

    const periodLabel = chartData.length > 0
        ? `${format(new Date(chartData[0].date), 'yyyy.MM.dd')} → ${format(new Date(chartData[chartData.length - 1].date), 'yyyy.MM.dd')}`
        : ''

    const canRunQuery = !!selectedStock && !!dateInput && !loading
    // Detect when current inputs no longer match the last applied query
    const isStale = appliedQuery && (
        appliedQuery.stock.stockCode !== selectedStock?.stockCode ||
        appliedQuery.startDate !== dateInput
    )

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full pb-8">
            {/* Hero */}
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[32px] text-foreground">
                    {t('whatIf')}
                </h1>
                <span className="serif-italic text-xs text-muted-foreground block mt-1">
                    {t('whatIfDesc')}
                </span>
            </section>

            {/* Controls */}
            <section className="mx-4 mb-4 bg-card border border-border p-5">
                <div className="eyebrow mb-3">
                    {language === 'ko' ? 'INPUT · 시뮬레이션 조건' : 'INPUT · Conditions'}
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase block mb-1.5">
                            {t('stock')}
                        </label>
                        <StockSearchCombobox
                            value={stockDisplayName}
                            onSelect={setSelectedStock}
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase block mb-1.5">
                            {t('whatIfBuyDate')}
                        </label>
                        <input
                            type="date"
                            className="flex h-10 w-full border border-border bg-background px-3 py-2 text-base md:text-sm font-serif numeric focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={dateInput}
                            onChange={(e) => setDateInput(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                                {t('whatIfInvestAmount')}
                            </label>
                            <CurrencyToggle
                                value={amountCurrency}
                                onChange={setAmountCurrency}
                            />
                        </div>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder={
                                amountCurrency === 'KRW'
                                    ? (language === 'ko' ? '예: 1,000,000' : 'e.g. 1,000,000')
                                    : (language === 'ko' ? '예: 1,000' : 'e.g. 1,000')
                            }
                            className="flex h-10 w-full border border-border bg-background px-3 py-2 text-base md:text-sm font-serif numeric placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={amountInput}
                            onChange={(e) => setAmountInput(formatAmountInput(e.target.value))}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={handleRunQuery}
                        disabled={!canRunQuery}
                        className={cn(
                            'mt-1 w-full py-3 text-sm font-bold inline-flex items-center justify-center gap-2 transition-opacity',
                            'bg-primary text-primary-foreground',
                            'disabled:opacity-50 hover:opacity-90',
                            isStale && 'ring-2 ring-primary/40',
                        )}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('whatIfFetching')}
                            </>
                        ) : (
                            isStale
                                ? (language === 'ko' ? '조건 변경 · 다시 조회' : 'Re-run with new inputs')
                                : (language === 'ko' ? '조회' : 'Run')
                        )}
                    </button>
                </div>
            </section>

            {/* Error / Empty / Result */}
            {!loading && error && (
                <section className="mx-4 mb-4 bg-card border border-loss/40 p-4 flex gap-3">
                    <Info className="h-4 w-4 text-loss shrink-0 mt-0.5" />
                    <div>
                        <div className="text-[11px] font-bold text-loss tracking-[0.5px] uppercase">
                            {t('error')}
                        </div>
                        <div className="text-[13px] text-foreground mt-1">{error}</div>
                    </div>
                </section>
            )}

            {!loading && !error && chartData.length === 0 && (
                <section className="mx-4 mb-4 bg-card border border-border p-10 text-center">
                    <div className="hero-serif text-[20px] text-foreground mb-1.5">
                        {t('whatIfSelectTitle')}
                    </div>
                    <p className="serif-italic text-[13px] text-muted-foreground">
                        {t('whatIfSelectHint')}
                    </p>
                </section>
            )}

            {!loading && !error && selectedStock && chartData.length > 0 && (
                <ResultBlock
                    chartData={chartData}
                    profitRate={profitRate}
                    isProfit={isProfit}
                    firstPrice={firstPrice}
                    lastPrice={lastPrice}
                    hasAmount={hasAmount}
                    parsedAmount={parsedAmount}
                    sharesAcquired={sharesAcquired}
                    todayValueDisplay={todayValueDisplay}
                    absoluteProfit={absoluteProfit}
                    amountCurrency={amountCurrency}
                    stockCurrency={stockCurrency}
                    insights={insights}
                    areaColor={areaColor}
                    fmtMoney={fmtMoney}
                    isUS={isUS}
                    periodLabel={periodLabel}
                    stockDisplayName={stockDisplayName}
                    language={language}
                    t={t}
                />
            )}
        </div>
    )
}

function CurrencyToggle({
    value, onChange,
}: {
    value: 'KRW' | 'USD'
    onChange: (v: 'KRW' | 'USD') => void
}) {
    return (
        <div className="inline-flex border border-border" role="group">
            {(['KRW', 'USD'] as const).map((c) => {
                const active = value === c
                return (
                    <button
                        key={c}
                        type="button"
                        onClick={() => onChange(c)}
                        className={cn(
                            'px-2 h-6 text-[10px] font-bold tracking-[0.5px] transition-colors',
                            active
                                ? 'bg-foreground text-background'
                                : 'bg-background text-muted-foreground hover:text-foreground',
                        )}
                        aria-pressed={active}
                    >
                        {c}
                    </button>
                )
            })}
        </div>
    )
}

interface ResultBlockProps {
    chartData: ChartData[]
    profitRate: number
    isProfit: boolean
    firstPrice: number
    lastPrice: number
    hasAmount: boolean
    parsedAmount: number
    sharesAcquired: number
    todayValueDisplay: number
    absoluteProfit: number
    amountCurrency: 'KRW' | 'USD'
    stockCurrency: 'KRW' | 'USD'
    insights: {
        best: { date: string; price: number }
        worst: { date: string; price: number }
        mdd: { date: string; pct: number }
    } | null
    areaColor: string
    fmtMoney: (value: number, currency: 'KRW' | 'USD', opts?: { compact?: boolean; integer?: boolean }) => string
    isUS: boolean
    periodLabel: string
    stockDisplayName: string
    language: string
    t: (k: any) => string
}

function ResultBlock({
    chartData, profitRate, isProfit, firstPrice, lastPrice,
    hasAmount, parsedAmount, sharesAcquired, todayValueDisplay, absoluteProfit,
    amountCurrency, stockCurrency,
    insights, areaColor, fmtMoney, isUS, periodLabel, stockDisplayName,
    language, t,
}: ResultBlockProps) {
    const formatShares = (n: number) =>
        n >= 1
            ? n.toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 2 })
            : n.toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 4 })

    const showCompact = (v: number) =>
        amountCurrency === 'KRW' && Math.abs(v) >= 100_000_000

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Result hero */}
            <div className="mx-4 mb-4 relative overflow-hidden border bg-card" style={{ padding: 22 }}>
                <div
                    className={cn(
                        'absolute top-0 left-0 right-0 h-[3px]',
                        isProfit ? 'bg-profit' : 'bg-loss',
                    )}
                />

                <div className="flex items-center justify-between mb-1">
                    <span className="eyebrow">
                        {language === 'ko' ? `RESULT · ${t('whatIfIfBought')}` : 'RESULT · IF YOU BOUGHT THEN'}
                    </span>
                    <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                        {periodLabel}
                    </span>
                </div>

                <div className="font-serif text-[16px] text-foreground mt-1.5 truncate">
                    {stockDisplayName}
                </div>

                <div className="text-[11px] font-semibold text-muted-foreground tracking-[0.5px] mt-3.5 mb-1">
                    {t('returnRate')}
                </div>
                <div
                    className={cn(
                        'amount-display text-[36px] leading-none numeric',
                        isProfit ? 'text-profit' : 'text-loss',
                    )}
                >
                    {isProfit ? '+' : ''}{profitRate.toFixed(2)}%
                </div>

                <div className="flex gap-4 mt-3.5 items-stretch">
                    <div>
                        <div className="text-[10px] font-semibold text-muted-foreground tracking-[0.5px] uppercase">
                            {t('pastPrice')}
                        </div>
                        <div className="text-[14px] font-bold mt-1 numeric font-serif text-foreground">
                            {fmtMoney(firstPrice, stockCurrency)}
                        </div>
                    </div>
                    <div className="w-px bg-border self-stretch" />
                    <div>
                        <div className="text-[10px] font-semibold text-muted-foreground tracking-[0.5px] uppercase">
                            {t('currentPrice')}
                        </div>
                        <div className="text-[14px] font-bold mt-1 numeric font-serif text-foreground">
                            {fmtMoney(lastPrice, stockCurrency)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Amount-based valuation */}
            {hasAmount && (
                <section className="mx-4 mb-4 grid grid-cols-2 gap-2">
                    <div className="p-4 bg-card border border-border">
                        <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                            {t('whatIfTodayValue')}
                        </div>
                        <div className={cn(
                            'font-serif text-lg font-semibold mt-1.5 numeric',
                            isProfit ? 'text-profit' : 'text-loss',
                        )}>
                            {fmtMoney(todayValueDisplay, amountCurrency, { compact: showCompact(todayValueDisplay), integer: true })}
                        </div>
                        <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-2 pt-2 border-t border-border/60 flex justify-between">
                            <span>{t('whatIfShares')}</span>
                            <span className="numeric text-foreground">
                                {formatShares(sharesAcquired)}{t('whatIfSharesUnit')}
                            </span>
                        </div>
                    </div>
                    <div className="p-4 bg-card border border-border">
                        <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                            {t('pl')}
                        </div>
                        <div className={cn(
                            'font-serif text-lg font-semibold mt-1.5 numeric',
                            isProfit ? 'text-profit' : 'text-loss',
                        )}>
                            {isProfit ? '+' : ''}{fmtMoney(absoluteProfit, amountCurrency, { compact: showCompact(absoluteProfit), integer: true })}
                        </div>
                        <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-2 pt-2 border-t border-border/60 flex justify-between">
                            <span>{t('totalInvested')}</span>
                            <span className="numeric text-foreground">
                                {fmtMoney(parsedAmount, amountCurrency, { compact: showCompact(parsedAmount), integer: true })}
                            </span>
                        </div>
                    </div>
                </section>
            )}

            {/* Chart */}
            <div className="px-6 pb-3 flex justify-between items-center">
                <span className="eyebrow">
                    {language === 'ko' ? `CHART · ${t('whatIfChartTitle')}` : 'CHART · PRICE HISTORY'}
                </span>
                <span className="text-[10px] text-muted-foreground tracking-[0.5px]">
                    {chartData.length}{language === 'ko' ? '일' : 'd'}
                </span>
            </div>

            <section className="mx-4 mb-4 bg-card border border-border p-3 pt-4">
                <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="whatIfArea" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={areaColor} stopOpacity={0.28} />
                                    <stop offset="100%" stopColor={areaColor} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(s) => format(new Date(s), 'MM.dd')}
                                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={36}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => isUS ? v.toFixed(0) : v.toLocaleString()}
                                width={56}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 0,
                                    color: 'var(--card-foreground)',
                                    fontSize: '12px',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                                }}
                                cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                labelFormatter={(label) => format(new Date(label), language === 'ko' ? 'yyyy년 MM월 dd일' : 'MMM dd, yyyy')}
                                formatter={(value: number) => [fmtMoney(value, stockCurrency), stockDisplayName]}
                            />
                            <Area
                                type="monotoneX"
                                dataKey="close"
                                stroke={areaColor}
                                strokeWidth={1.8}
                                fill="url(#whatIfArea)"
                                dot={false}
                                activeDot={{ r: 4, fill: areaColor, strokeWidth: 0 }}
                                animationDuration={900}
                                animationEasing="ease-in-out"
                            />
                            {insights && (
                                <>
                                    <ReferenceDot
                                        x={insights.best.date}
                                        y={insights.best.price}
                                        r={4}
                                        fill="var(--profit)"
                                        stroke="var(--card)"
                                        strokeWidth={2}
                                    />
                                    <ReferenceDot
                                        x={insights.worst.date}
                                        y={insights.worst.price}
                                        r={4}
                                        fill="var(--loss)"
                                        stroke="var(--card)"
                                        strokeWidth={2}
                                    />
                                </>
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </section>

            {/* Insights */}
            {insights && (
                <>
                    <div className="px-6 pb-3 flex justify-between items-center">
                        <span className="eyebrow">
                            {language === 'ko' ? `INSIGHTS · ${t('whatIfInsights')}` : 'INSIGHTS'}
                        </span>
                    </div>

                    <div className="mx-4 space-y-1.5">
                        <InsightRow
                            tone="profit"
                            label={t('whatIfBestDay')}
                            desc={t('whatIfBestDayDesc')}
                            date={insights.best.date}
                            valueLabel={fmtMoney(insights.best.price, stockCurrency)}
                            language={language}
                        />
                        <InsightRow
                            tone="loss"
                            label={t('whatIfWorstDay')}
                            desc={t('whatIfWorstDayDesc')}
                            date={insights.worst.date}
                            valueLabel={fmtMoney(insights.worst.price, stockCurrency)}
                            language={language}
                        />
                        <InsightRow
                            tone="loss"
                            label={t('whatIfMDD')}
                            desc={t('whatIfMDDDesc')}
                            date={insights.mdd.date}
                            valueLabel={`${insights.mdd.pct.toFixed(2)}%`}
                            language={language}
                        />
                    </div>
                </>
            )}
        </div>
    )
}

function InsightRow({
    tone, label, desc, date, valueLabel, language,
}: {
    tone: 'profit' | 'loss'
    label: string
    desc: string
    date: string
    valueLabel: string
    language: string
}) {
    return (
        <div
            className="bg-card border border-border p-4"
            style={{
                borderLeftWidth: '3px',
                borderLeftColor: tone === 'profit' ? 'var(--profit)' : 'var(--loss)',
            }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="font-serif text-[14px] font-semibold text-foreground">
                        {label}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        {desc}
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className={cn(
                        'text-[13px] font-bold numeric',
                        tone === 'profit' ? 'text-profit' : 'text-loss',
                    )}>
                        {valueLabel}
                    </div>
                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-0.5 numeric" suppressHydrationWarning>
                        {format(new Date(date), language === 'ko' ? 'yyyy.MM.dd' : 'MMM dd, yyyy')}
                    </div>
                </div>
            </div>
        </div>
    )
}
