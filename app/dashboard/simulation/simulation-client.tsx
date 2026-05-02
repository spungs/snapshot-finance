'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { Loader2, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

interface SimulationHolding {
    stockName: string
    stockCode: string
    quantity: number
    snapshotPrice: number
    currentPrice: number
    originalValue: number
    simulatedValue: number
    gain: number
    gainRate: number
    gainKRW?: number
    gainRateKRW?: number
    simulatedValueKRW?: number
    currency: string
    error?: string
}

interface SimulationResult {
    snapshotDate: string
    totalOriginalValue: number
    totalSimulatedValue: number
    totalGain: number
    totalGainRate: number
    holdings: SimulationHolding[]
    exchangeRate: number
    snapshotExchangeRate: number
}

interface SimulationClientProps {
    initialSnapshots: any[]
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

export default function SimulationClient({ initialSnapshots }: SimulationClientProps) {
    const { t, language } = useLanguage()
    const searchParams = useSearchParams()
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('')
    const [result, setResult] = useState<SimulationResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    const selectedSnapshot = initialSnapshots.find(s => s.id === selectedSnapshotId)

    useEffect(() => {
        const id = searchParams.get('snapshotId')
        if (id) {
            setSelectedSnapshotId(id)
            executeSimulation(id)
        }
    }, [searchParams])

    // Abort any in-flight simulation when the component unmounts
    useEffect(() => () => abortRef.current?.abort(), [])

    const executeSimulation = async (id: string) => {
        // Cancel any previous in-flight request so a stale response can't overwrite a newer one
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const res = await fetch('/api/simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshotId: id }),
                signal: controller.signal,
            })
            const data = await res.json()

            if (controller.signal.aborted) return

            if (data.success) {
                setResult(data.data)
            } else {
                setError(data.error || t('simulationFailed'))
            }
        } catch (e) {
            if ((e as Error).name === 'AbortError') return
            setError(t('runSimulationFailed'))
        } finally {
            if (!controller.signal.aborted) setLoading(false)
        }
    }

    const handleSnapshotChange = (id: string) => {
        setSelectedSnapshotId(id)
        setResult(null)
        setError(null)
    }

    const runSimulation = () => {
        if (!selectedSnapshotId) return
        executeSimulation(selectedSnapshotId)
    }

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full pb-8">
            {/* Hero */}
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[32px] text-foreground">
                    {t('simulationTitle')}
                </h1>
                <span className="serif-italic text-xs text-muted-foreground block mt-1">
                    {t('simulationDesc')}
                </span>
            </section>

            {/* Snapshot picker */}
            <section className="mx-4 mb-4 bg-card border border-border p-5">
                <div className="eyebrow mb-2">
                    {language === 'ko' ? `STEP 01 · ${t('selectSnapshot')}` : `STEP 01 · ${t('selectSnapshot')}`}
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">
                    {t('selectSnapshotDesc')}
                </p>

                <Select value={selectedSnapshotId} onValueChange={handleSnapshotChange}>
                    <SelectTrigger className="w-full h-11 bg-background border-border rounded-none font-serif text-[14px]">
                        <SelectValue placeholder={t('selectSnapshotPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {initialSnapshots.map((snap) => {
                            const isEn = language === 'en'
                            let displayValue = Number(snap.totalValue)
                            let currency: 'KRW' | 'USD' = 'KRW'
                            if (isEn && snap.exchangeRate) {
                                displayValue = displayValue / snap.exchangeRate
                                currency = 'USD'
                            }
                            const dateStr = formatDate(snap.snapshotDate)
                            const assetStr = `${t('totalAssets')}: ${formatCurrency(displayValue, currency)}`
                            const label = snap.note ? `${dateStr} | ${snap.note}` : dateStr
                            return (
                                <SelectItem key={snap.id} value={snap.id}>
                                    <span className="block truncate max-w-[260px] sm:max-w-none">
                                        {label} ({assetStr})
                                    </span>
                                </SelectItem>
                            )
                        })}
                    </SelectContent>
                </Select>

                <button
                    type="button"
                    onClick={runSimulation}
                    disabled={!selectedSnapshotId || loading}
                    className="mt-3 w-full bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('calculating')}
                        </>
                    ) : (
                        t('runSimulation')
                    )}
                </button>
            </section>

            {error && (
                <section className="mx-4 mb-4 bg-card border border-loss/40 p-4 flex gap-3">
                    <AlertCircle className="h-4 w-4 text-loss shrink-0 mt-0.5" />
                    <div>
                        <div className="text-[11px] font-bold text-loss tracking-[0.5px] uppercase">{t('error')}</div>
                        <div className="text-[13px] text-foreground mt-1">{error}</div>
                    </div>
                </section>
            )}

            {result && selectedSnapshot && (
                <ResultBlock
                    result={result}
                    selectedSnapshot={selectedSnapshot}
                    language={language}
                    t={t}
                />
            )}
        </div>
    )
}

function ResultBlock({
    result, selectedSnapshot, language, t,
}: {
    result: SimulationResult
    selectedSnapshot: any
    language: string
    t: (k: any) => string
}) {
    const isEn = language === 'en'
    const currency: 'KRW' | 'USD' = isEn ? 'USD' : 'KRW'
    const rate = result.exchangeRate || 1435
    const snapshotRate = result.snapshotExchangeRate || 1

    const totalInvested = isEn && result.snapshotExchangeRate
        ? result.totalOriginalValue / result.snapshotExchangeRate
        : result.totalOriginalValue

    const currentStockValue = isEn && result.exchangeRate
        ? result.totalSimulatedValue / result.exchangeRate
        : result.totalSimulatedValue

    const cashBalance = Number(selectedSnapshot.cashBalance)
    const snapshotValuationVal = Number(selectedSnapshot.totalValue)

    const displaySnapshotValue = isEn && result.snapshotExchangeRate
        ? snapshotValuationVal / result.snapshotExchangeRate
        : snapshotValuationVal

    const snapshotCashValue = isEn && result.snapshotExchangeRate
        ? cashBalance / result.snapshotExchangeRate
        : cashBalance

    const currentTotalValue = currentStockValue
    const totalGain = currentTotalValue - totalInvested

    const snapshotProfitVal = Number(selectedSnapshot.totalProfit)
    const snapshotProfit = isEn && result.snapshotExchangeRate
        ? snapshotProfitVal / result.snapshotExchangeRate
        : snapshotProfitVal

    const profitDiff = currentTotalValue - displaySnapshotValue
    const simulationYield = displaySnapshotValue ? (profitDiff / displaySnapshotValue) * 100 : 0
    const isUp = profitDiff >= 0

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Result hero — accent stripe + big simulated diff */}
            <div className="mx-4 mb-4 relative overflow-hidden border bg-card" style={{ padding: 22 }}>
                <div
                    className={cn(
                        'absolute top-0 left-0 right-0 h-[3px]',
                        isUp ? 'bg-profit' : 'bg-loss',
                    )}
                />

                <div className="flex items-center justify-between mb-1">
                    <span className="eyebrow">
                        {language === 'ko' ? `RESULT · ${t('simulationResult')}` : `RESULT · ${t('simulationResult')}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                        {formatDate(result.snapshotDate, 'yyyy.MM.dd')} {t('basedOn')}
                    </span>
                </div>

                <div className="text-[11px] font-semibold text-muted-foreground tracking-[0.5px] mt-3 mb-1">
                    {language === 'ko' ? '시뮬레이션 차이' : 'Simulation difference'}
                </div>
                <div
                    className={cn(
                        'amount-display text-[30px] leading-none numeric',
                        isUp ? 'text-profit' : 'text-loss',
                    )}
                >
                    {isUp ? '+' : ''}{formatCurrency(profitDiff, currency)}
                </div>

                <div className="flex gap-4 mt-3.5 items-stretch">
                    <div>
                        <div className="text-[10px] font-semibold text-muted-foreground tracking-[0.5px] uppercase">
                            {language === 'ko' ? '시뮬레이션 수익률' : 'Sim. yield'}
                        </div>
                        <div className="mt-1"><UpDown value={simulationYield} big /></div>
                    </div>
                    <div className="w-px bg-border self-stretch" />
                    <div>
                        <div className="text-[10px] font-semibold text-muted-foreground tracking-[0.5px] uppercase">
                            {language === 'ko' ? '평가손익 변화' : 'P/L change'}
                        </div>
                        <div
                            className={cn(
                                'text-[15px] font-bold mt-1 numeric',
                                totalGain - snapshotProfit >= 0 ? 'text-profit' : 'text-loss',
                            )}
                        >
                            {totalGain - snapshotProfit >= 0 ? '+' : ''}
                            {formatCurrency(totalGain - snapshotProfit, currency)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Two-up: 과거 가치 / 현재 가치 */}
            <section className="mx-4 mb-2 grid grid-cols-2 gap-2">
                <div className="p-4 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {t('pastValue')}
                    </div>
                    <div className="font-serif text-lg font-semibold text-foreground mt-1.5 numeric">
                        {formatCurrency(displaySnapshotValue, currency)}
                    </div>
                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-2 pt-2 border-t border-border/60">
                        <div className="flex justify-between">
                            <span>{t('totalInvested')}</span>
                            <span className="numeric text-foreground">{formatCurrency(totalInvested, currency)}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                            <span>{language === 'ko' ? '예수금' : 'Cash'}</span>
                            <span className="numeric text-foreground">{formatCurrency(snapshotCashValue, currency)}</span>
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {t('currentValue')}
                    </div>
                    <div className="font-serif text-lg font-semibold text-foreground mt-1.5 numeric">
                        {formatCurrency(currentTotalValue, currency)}
                    </div>
                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-2 pt-2 border-t border-border/60">
                        <div className="flex justify-between">
                            <span>{t('basedOnRealtime')}</span>
                            <span className="text-[9px]">({t('exclCash')})</span>
                        </div>
                        {isEn && (
                            <div className="flex justify-between mt-1">
                                <span>Rate</span>
                                <span className="numeric text-foreground">{formatNumber(rate, 0)}</span>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* P/L detail card */}
            <section className="mx-4 mb-4 p-4 bg-card border border-border">
                <div className="flex justify-between items-center py-1">
                    <span className="text-[11px] text-muted-foreground tracking-[0.5px]">
                        {t('currentPL')}
                    </span>
                    <span className={cn(
                        'text-[13px] font-bold numeric',
                        totalGain >= 0 ? 'text-profit' : 'text-loss',
                    )}>
                        {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain, currency)}
                    </span>
                </div>
                <div className="flex justify-between items-center py-1 mt-1 pt-2 border-t border-border/60">
                    <span className="text-[11px] text-muted-foreground tracking-[0.5px]">
                        {t('snapshotPL')}
                    </span>
                    <span className={cn(
                        'text-[13px] font-bold numeric',
                        snapshotProfit >= 0 ? 'text-profit' : 'text-loss',
                    )}>
                        {snapshotProfit >= 0 ? '+' : ''}{formatCurrency(snapshotProfit, currency)}
                    </span>
                </div>
            </section>

            {/* Holdings comparison */}
            <div className="px-6 pb-3 flex justify-between items-center">
                <span className="eyebrow">
                    {language === 'ko'
                        ? `HOLDINGS · ${result.holdings.length}`
                        : `HOLDINGS · ${result.holdings.length}`}
                </span>
                <span className="text-[10px] text-muted-foreground tracking-[0.5px]">
                    {t('holdingsComparison')}
                </span>
            </div>

            <div className="px-4 pb-4 space-y-1.5">
                {result.holdings.map((item, index) => {
                    let displayCurrency: 'KRW' | 'USD' = item.currency as 'KRW' | 'USD'
                    let displayCurrentPrice = item.currentPrice
                    let displayAvgPrice = item.snapshotPrice
                    let displayGain = item.gain

                    if (isEn) {
                        displayCurrency = 'USD'
                        if (item.currency === 'KRW') {
                            displayCurrentPrice = item.currentPrice / rate
                            displayAvgPrice = item.snapshotPrice / snapshotRate
                        }
                        const valNowUSD = item.currency === 'KRW'
                            ? (item.currentPrice * item.quantity) / rate
                            : (item.currentPrice * item.quantity)
                        const valThenUSD = item.currency === 'KRW'
                            ? (item.snapshotPrice * item.quantity) / snapshotRate
                            : (item.snapshotPrice * item.quantity)
                        displayGain = valNowUSD - valThenUSD
                    }

                    const weight = ((item.simulatedValueKRW || 0) / result.totalSimulatedValue) * 100
                    const isItemUp = displayGain >= 0

                    return (
                        <div
                            key={`${item.stockCode}-${index}`}
                            className="bg-card border border-border p-4"
                            style={{
                                borderLeftWidth: '3px',
                                borderLeftColor: isItemUp ? 'var(--profit)' : 'var(--loss)',
                            }}
                        >
                            {/* Row 1: 종목명 + 수익률 */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="font-serif text-[15px] font-semibold text-foreground leading-snug break-keep flex-1 min-w-0">
                                    {item.stockName}
                                </div>
                                <UpDown value={item.gainRate} />
                            </div>

                            {/* Row 2: 메타 + gain */}
                            <div className="mt-1.5 flex items-end justify-between gap-3">
                                <div className="text-[10px] text-muted-foreground tracking-[0.5px] flex-1 min-w-0">
                                    {item.stockCode}
                                    {' · '}
                                    {formatNumber(item.quantity)}{language === 'ko' ? '주' : 'shr'}
                                    {' · '}
                                    {language === 'ko' ? `비중 ${formatNumber(weight, 1)}%` : `${formatNumber(weight, 1)}% wt`}
                                </div>
                                <div className="text-right shrink-0">
                                    <div className={cn(
                                        'text-[14px] font-bold numeric',
                                        isItemUp ? 'text-profit' : 'text-loss',
                                    )}>
                                        {isItemUp ? '+' : ''}{formatCurrency(displayGain, displayCurrency)}
                                    </div>
                                    {displayCurrency === 'USD' && item.gainKRW !== undefined && (
                                        <div className={cn(
                                            'text-[10px] mt-0.5 numeric',
                                            item.gainKRW >= 0 ? 'text-profit/70' : 'text-loss/70',
                                        )}>
                                            ({item.gainKRW >= 0 ? '+' : ''}{formatCurrency(item.gainKRW, 'KRW')})
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Row 3: avg → current price */}
                            <div className="mt-2.5 pt-2.5 border-t border-border/60 grid grid-cols-2 gap-3 text-[11px]">
                                <div>
                                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] uppercase">
                                        {t('pastPrice')}
                                    </div>
                                    <div className="font-serif text-[13px] font-semibold text-foreground mt-0.5 numeric">
                                        {formatCurrency(displayAvgPrice, displayCurrency)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] uppercase">
                                        {t('currentPrice')}
                                    </div>
                                    <div className="font-serif text-[13px] font-semibold text-foreground mt-0.5 numeric">
                                        {item.error ? (
                                            <span className="text-loss text-[11px]">{t('fetchFailed')}</span>
                                        ) : (
                                            formatCurrency(displayCurrentPrice, displayCurrency)
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
