'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PerformanceChart } from '@/components/dashboard/performance-chart'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { useStockTicks } from '@/lib/hooks/use-stock-ticks'
import type { StockTick } from '@/lib/hooks/use-stock-tick'
import { normalizeMarket, type Market } from '@/lib/utils/market-hours'
import { PriceUpdatedFootnote } from '@/components/dashboard/price-updated-footnote'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Wallet, Loader2 } from 'lucide-react'
import { findPreviousSnapshot, calcChange, type ChangeResult } from '@/lib/utils/snapshot-comparison'

interface Holding {
    id: string
    stockCode: string
    stockName: string
    market: string
    currency: string
    quantity: number
    currentPrice: number
    totalCost: number
    purchaseRate: number
    currentValue: number
    profit: number
    profitRate: number
    /** 가격이 마지막으로 갱신된 시점 (ISO). 가격 신선도 footnote 에 사용. */
    priceUpdatedAt?: string | null
}

interface SnapshotLite {
    id: string
    snapshotDate: string
    totalValue: number
    profitRate: number
    exchangeRate?: number
}

interface ChartDataPoint {
    date: string
    totalValue: number
    totalCost: number
    totalProfit: number
    profitRate: number
    cashBalance: number
    totalAsset: number
}

interface HomeClientProps {
    summary: {
        totalValue: number
        totalCost: number
        totalProfit: number
        totalProfitRate: number
        cashBalance: number
        exchangeRate: number
        exchangeRateUpdatedAt?: string | null
        holdingsCount: number
    }
    holdings: Holding[]
    recentSnapshots: SnapshotLite[]
    initialChartData: ChartDataPoint[]
    todayLabel: string
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

export function HomeClient({
    summary: ssrSummary,
    holdings: ssrHoldings,
    recentSnapshots,
    initialChartData,
    todayLabel,
}: HomeClientProps) {
    const { t, language } = useLanguage()
    const { baseCurrency } = useCurrency()

    // 홈 = "캐시값 즉시 표시 → 모든 종목 첫 tick 일괄 commit → 그 후 고정" (NH 패턴).
    // 보유 페이지의 매 tick 깜빡임은 의도적으로 피한다. 부분 도착(3초 안에 일부만) 시
    // 받은 만큼만 일괄 commit, 못 받은 종목은 SSR 값 + footnote 의 stale 안내로 처리.
    const tickSubs = useMemo(
        () => ssrHoldings.map((h) => {
            const m = h.market?.toUpperCase()
            const market: 'KR' | 'US' | null =
                m === 'KOSPI' || m === 'KOSDAQ' || m === 'KS' || m === 'KQ' ? 'KR'
                    : m === 'US' || m === 'NASD' || m === 'NAS' || m === 'NYSE' || m === 'NYS' || m === 'AMEX' || m === 'AMS' ? 'US'
                        : null
            return market ? { code: h.stockCode, market } : null
        }).filter((x): x is { code: string; market: 'KR' | 'US' } => x !== null),
        [ssrHoldings],
    )

    // committedTicks === null 동안엔 SSR 값 표시 + 스피너 노출.
    // null 아닌 값으로 전이되는 순간 1회 일괄 commit. 그 후 변경 없음.
    const [committedTicks, setCommittedTicks] = useState<ReadonlyMap<string, StockTick> | null>(null)
    const activeSubs = useMemo(
        () => (committedTicks !== null ? [] : tickSubs),
        [committedTicks, tickSubs],
    )
    const ticks = useStockTicks(activeSubs)

    // timeout closure 안에서 ticks 의 최신 스냅샷을 안전하게 읽기 위한 ref.
    // setState 의 함수형 updater 만으로는 외부 변수(ticks)에 접근 못 함.
    const ticksRef = useRef(ticks)
    ticksRef.current = ticks

    // 모든 보유 종목이 첫 tick 을 받으면 즉시 commit. 종목 0개면 빈 commit 으로 스피너 종료.
    useEffect(() => {
        if (committedTicks !== null) return
        if (tickSubs.length === 0) {
            setCommittedTicks(new Map())
            return
        }
        if (tickSubs.every((s) => ticks.has(s.code))) {
            setCommittedTicks(new Map(ticks))
        }
    }, [ticks, tickSubs, committedTicks])

    // 3초 timeout — 일부 종목이 안 오면 그 시점의 ticks 로 부분 commit.
    useEffect(() => {
        if (committedTicks !== null || tickSubs.length === 0) return
        const timer = setTimeout(() => {
            setCommittedTicks((prev) => prev ?? new Map(ticksRef.current))
        }, 3000)
        return () => clearTimeout(timer)
    }, [committedTicks, tickSubs.length])

    const isRefreshing = tickSubs.length > 0 && committedTicks === null

    // tick 으로 보강한 라이브 holdings. commit 전엔 SSR 그대로.
    const liveHoldings = useMemo(() => {
        if (!committedTicks || committedTicks.size === 0) return ssrHoldings
        return ssrHoldings.map((h) => {
            const t = committedTicks.get(h.stockCode)
            if (!t || t.price === h.currentPrice) return h
            const newValue = h.quantity * t.price
            return {
                ...h,
                currentPrice: t.price,
                currentValue: newValue,
                profit: newValue - h.totalCost,
                profitRate: h.totalCost > 0 ? ((newValue - h.totalCost) / h.totalCost) * 100 : 0,
                priceUpdatedAt: new Date(t.ts).toISOString(),
            }
        })
    }, [ssrHoldings, committedTicks])

    // 라이브 summary — 보유탭과 동일 공식.
    // USD 종목: 매입 시점 환율을 cost 에, 현재 환율을 value 에 적용. totalValue 는 주식+예수금.
    const liveSummary = useMemo(() => {
        if (!committedTicks || committedTicks.size === 0) return ssrSummary
        const rate = ssrSummary.exchangeRate || FALLBACK_USD_RATE
        let totalCost = 0
        let totalStockValue = 0
        for (const h of liveHoldings) {
            const buyRate = h.currency === 'USD'
                ? (h.purchaseRate && h.purchaseRate !== 1 ? h.purchaseRate : rate)
                : 1
            totalCost += h.currency === 'USD' ? h.totalCost * buyRate : h.totalCost
            totalStockValue += h.currency === 'USD' ? h.currentValue * rate : h.currentValue
        }
        const totalProfit = totalStockValue - totalCost
        const totalProfitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0
        const totalValue = totalStockValue + ssrSummary.cashBalance
        return { ...ssrSummary, totalCost, totalValue, totalProfit, totalProfitRate }
    }, [liveHoldings, ssrSummary, committedTicks])

    const exRate = liveSummary.exchangeRate || FALLBACK_USD_RATE

    const convert = (v: number) => baseCurrency === 'KRW' ? v : v / exRate
    const isProfit = liveSummary.totalProfit >= 0

    const displayValue = convert(liveSummary.totalValue)
    const displayCost = convert(liveSummary.totalCost)
    const displayProfit = convert(liveSummary.totalProfit)
    const displayCash = convert(liveSummary.cashBalance)

    const latestSnap = recentSnapshots[0]
    const latestRate = latestSnap ? Number(latestSnap.profitRate) : 0
    const diffFromLatest = latestSnap ? liveSummary.totalProfitRate - latestRate : 0
    const hasChart = recentSnapshots.length >= 2

    // 일간/주간 변동 — 현재 잔고를 한 점으로 래핑해 chartData 의 과거 스냅샷과 비교.
    const today = new Date()
    const currentPoint = {
        date: today,
        totalValue: liveSummary.totalValue,
        profitRate: liveSummary.totalProfitRate,
    }
    const dailyChange: ChangeResult | null = calcChange(
        currentPoint,
        findPreviousSnapshot(initialChartData, today, 1),
    )
    const weeklyChange: ChangeResult | null = calcChange(
        currentPoint,
        findPreviousSnapshot(initialChartData, today, 7),
    )
    const hasChangeData = dailyChange !== null || weeklyChange !== null

    // USD 종목 한 개라도 보유 시 환율 footnote 노출 — 의미 없으면 노이즈가 되므로 숨김.
    const hasUsdHolding = liveHoldings.some(h => h.currency === 'USD')

    // 이자 환산 원금 — 사용자가 설정한 연 이자율(기본 3%)을 기준으로
    // "이 수익을 예금 이자로 받으려면 얼마가 필요한가" 환산. localStorage 영속.
    const [interestRate, setInterestRate] = useLocalStorage('interestRate', 3)
    const safeRate = Math.max(0.01, interestRate)
    const interestPrincipal = displayProfit / (safeRate / 100)

    // Top returns — 평가수익률 상위 4개 (큰 순)
    const topReturns = [...liveHoldings]
        .sort((a, b) => b.profitRate - a.profitRate)
        .slice(0, 4)

    // 가격 신선도 footnote — 전체 종목 중 가장 오래된 priceUpdatedAt 으로 stale 안내.
    let oldestPriceTime: string | null = null
    const marketSet = new Set<Market>()
    for (const h of liveHoldings) {
        if (h.priceUpdatedAt && (!oldestPriceTime || new Date(h.priceUpdatedAt) < new Date(oldestPriceTime))) {
            oldestPriceTime = h.priceUpdatedAt
        }
        const nm = normalizeMarket(h.market)
        if (nm) marketSet.add(nm)
    }
    const markets = Array.from(marketSet)

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full">
            {/* Hero — Big serif amount + ▲ rate */}
            <section className="px-6 pt-3 pb-6">
                {/* 날짜 좌측 / 환율(USD 보유 시) 우측 — 메타 정보를 한 줄에 병렬 배치 */}
                <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="flex flex-col gap-0 min-w-0">
                        <div className="eyebrow">{todayLabel}</div>
                        <PriceUpdatedFootnote iso={oldestPriceTime} language={language} markets={markets} />
                    </div>
                    {hasUsdHolding && (
                        <div className="text-xs text-muted-foreground numeric">
                            1 USD ≈ {formatCurrency(exRate, 'KRW')}
                        </div>
                    )}
                </div>
                <div className="hero-serif text-[40px] sm:text-5xl text-foreground numeric flex items-center gap-2.5">
                    <span>{formatCurrency(displayValue, baseCurrency)}</span>
                    {isRefreshing && (
                        <Loader2
                            className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-muted-foreground/70 animate-spin shrink-0"
                            strokeWidth={2}
                            aria-label={language === 'ko' ? '실시간 가격 확인 중' : 'Checking live prices'}
                        />
                    )}
                </div>
                <div className="flex gap-2 items-center mt-2.5">
                    <UpDown value={liveSummary.totalProfitRate} big />
                    <span className={cn('text-[13px] font-semibold numeric', isProfit ? 'text-profit' : 'text-loss')}>
                        {isProfit ? '+' : ''}{formatCurrency(displayProfit, baseCurrency)}
                    </span>
                </div>
            </section>

            {/* Performance chart — 성과 흐름 */}
            {hasChart && (
                <section className="mx-4 mb-4">
                    <PerformanceChart initialChartData={initialChartData} />
                </section>
            )}

            {/* 일간/주간 변동 — 토스증권 스타일: 전일·1주 전 대비 수익률·평가금 변동 */}
            {hasChangeData && (
                <section className="mx-4 mb-4 grid grid-cols-2 gap-2">
                    {[
                        { label: language === 'ko' ? '일간 변동' : 'Daily', change: dailyChange },
                        { label: language === 'ko' ? '주간 변동' : 'Weekly', change: weeklyChange },
                    ].map(({ label, change }) => {
                        const isUp = change ? change.profitRateDiff >= 0 : true
                        const valueIsUp = change ? change.totalValueDiff >= 0 : true
                        const displayValueDiff = change
                            ? convert(Math.abs(change.totalValueDiff))
                            : 0
                        return (
                            <div key={label} className="p-4 bg-card border border-border">
                                <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase mb-1.5">
                                    {label}
                                </div>
                                {change ? (
                                    <>
                                        <div className={cn(
                                            'numeric font-bold text-[15px] tracking-tight inline-flex items-center gap-0.5',
                                            isUp ? 'text-profit' : 'text-loss',
                                        )}>
                                            <span aria-hidden>{isUp ? '▲' : '▼'}</span>
                                            <span>{Math.abs(change.profitRateDiff).toFixed(2)}%</span>
                                        </div>
                                        <div className={cn(
                                            'text-[11px] font-semibold numeric mt-0.5',
                                            valueIsUp ? 'text-profit' : 'text-loss',
                                        )}>
                                            {valueIsUp ? '+' : '−'}
                                            {formatCurrency(displayValueDiff, baseCurrency, { compact: true })}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-[15px] font-bold text-muted-foreground">—</div>
                                )}
                            </div>
                        )
                    })}
                </section>
            )}

            {/* Two-up — 매입금 / 평가손익금 (1억 이상은 자동 축약) */}
            <section className="mx-4 mb-2 grid grid-cols-2 gap-2">
                <div className="p-4 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {language === 'ko' ? '매입금' : 'Cost'}
                    </div>
                    <div className="font-serif text-lg font-semibold text-foreground mt-1.5 numeric">
                        {formatCurrency(displayCost, baseCurrency, { compact: true })}
                    </div>
                </div>
                <div className="p-4 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {language === 'ko' ? '평가손익금' : 'Unrealized P/L'}
                    </div>
                    <div className={cn(
                        'font-serif text-lg font-semibold mt-1.5 numeric',
                        isProfit ? 'text-profit' : 'text-loss',
                    )}>
                        {isProfit ? '+' : ''}{formatCurrency(displayProfit, baseCurrency, { compact: true })}
                    </div>
                    {/* 수익 발생 시 — "이 수익 = 연 N% 예금 X원 의 1년치 이자" 동기부여 시그널 */}
                    {liveSummary.totalProfit > 0 && (
                        <div className="mt-2 text-[11px] text-muted-foreground numeric flex items-baseline gap-1 flex-wrap">
                            <span aria-hidden>≈</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="border-b border-dashed border-muted-foreground/50 hover:border-foreground hover:text-foreground transition-colors"
                                        aria-label={t('interestPrincipal').replace('{rate}', interestRate.toString())}
                                    >
                                        {language === 'ko' ? `연 ${interestRate}%` : `${interestRate}%`}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64" align="start">
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <h4 className="font-semibold text-sm leading-none">
                                                {t('interestPrincipal').replace('{rate}', interestRate.toString())}
                                            </h4>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                {t('interestPrincipalTooltip')
                                                    .replace('{rate}', interestRate.toString())
                                                    .replace('{profit}', formatCurrency(displayProfit, baseCurrency))}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="interest-rate" className="text-xs whitespace-nowrap">
                                                {language === 'ko' ? '이자율' : 'Rate'} (%)
                                            </Label>
                                            <Input
                                                id="interest-rate"
                                                type="number"
                                                value={interestRate}
                                                onChange={(e) => {
                                                    const v = Number(e.target.value)
                                                    if (Number.isFinite(v) && v >= 0) setInterestRate(v)
                                                }}
                                                min={0}
                                                max={100}
                                                step={0.1}
                                                className="h-8"
                                            />
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <span>
                                {language === 'ko' ? '예금' : 'deposit'} {formatCurrency(interestPrincipal, baseCurrency, { compact: true })}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            {/* 예수금 단일 행 — 보유 탭 카드와 동일 톤, display only */}
            <section className="mx-4 mb-4 p-4 bg-card border border-border flex items-center gap-3">
                <div className="w-9 h-9 rounded-sm bg-accent-soft flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4 text-primary" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {language === 'ko' ? '예수금' : 'Cash balance'}
                    </div>
                </div>
                <div className="font-serif text-lg font-semibold text-foreground numeric truncate">
                    {formatCurrency(displayCash, baseCurrency, { compact: true })}
                </div>
            </section>

            {/* Recent snapshot ribbon */}
            {latestSnap && (
                <section className="mx-4 mb-4 p-[18px] bg-accent-soft border" style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}>
                    <div className="text-[11px] font-bold text-primary tracking-[1.5px] uppercase mb-1.5">
                        {language === 'ko' ? '최근 스냅샷' : 'Recent snapshot'}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="font-serif text-base text-foreground" suppressHydrationWarning>
                                {formatDate(latestSnap.snapshotDate, 'yyyy.MM.dd')}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                {language === 'ko' ? '지금과 ' : 'vs now '}
                                <span className={cn('font-semibold numeric', diffFromLatest >= 0 ? 'text-profit' : 'text-loss')}>
                                    {diffFromLatest >= 0 ? '+' : ''}{diffFromLatest.toFixed(2)}%
                                </span>
                                {language === 'ko' ? ' 차이' : ''}
                            </div>
                        </div>
                        <Link
                            href="/dashboard/snapshots"
                            className="bg-primary text-primary-foreground px-3.5 py-2 text-xs font-bold whitespace-nowrap hover:opacity-90 transition-opacity"
                        >
                            {language === 'ko' ? '전체보기' : 'View all'}
                        </Link>
                    </div>
                </section>
            )}

            {/* Top returns — 수익률 상위 */}
            {topReturns.length > 0 && (
                <section className="px-6 mb-4">
                    <div className="eyebrow mb-3.5">
                        {language === 'ko' ? '수익률 TOP' : 'TOP RETURNS'}
                    </div>
                    <ul className="divide-y divide-border">
                        {topReturns.map((h, i) => {
                            const value = h.currency === 'USD' ? h.currentValue * exRate : h.currentValue
                            const displayHValue = baseCurrency === 'KRW' ? value : value / exRate
                            return (
                                <li
                                    key={h.id}
                                    className="flex items-center gap-3.5 py-3"
                                >
                                    <span className="font-serif italic text-lg text-muted-foreground w-6 shrink-0">
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-bold text-foreground truncate">
                                            {h.stockName}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-0.5">
                                            {h.stockCode}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[13px] font-bold text-foreground numeric">
                                            {formatCurrency(displayHValue, baseCurrency)}
                                        </div>
                                        <div className="mt-0.5"><UpDown value={h.profitRate} /></div>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}
        </div>
    )
}
