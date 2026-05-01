'use client'

import Link from 'next/link'
import { PerformanceChart } from '@/components/dashboard/performance-chart'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { Wallet } from 'lucide-react'

interface Holding {
    id: string
    stockCode: string
    stockName: string
    market: string
    currency: string
    currentValue: number
    profit: number
    profitRate: number
}

interface SnapshotLite {
    id: string
    snapshotDate: string
    totalValue: number
    profitRate: number
    exchangeRate?: number
}

interface HomeClientProps {
    summary: {
        totalValue: number
        totalCost: number
        totalProfit: number
        totalProfitRate: number
        cashBalance: number
        exchangeRate: number
        holdingsCount: number
    }
    holdings: Holding[]
    recentSnapshots: SnapshotLite[]
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

export function HomeClient({ summary, holdings, recentSnapshots, todayLabel }: HomeClientProps) {
    const { t, language } = useLanguage()
    const { baseCurrency } = useCurrency()
    const exRate = summary.exchangeRate || 1435

    const convert = (v: number) => baseCurrency === 'KRW' ? v : v / exRate
    const isProfit = summary.totalProfit >= 0

    const displayValue = convert(summary.totalValue)
    const displayCost = convert(summary.totalCost)
    const displayProfit = convert(summary.totalProfit)
    const displayCash = convert(summary.cashBalance)

    const latestSnap = recentSnapshots[0]
    const latestRate = latestSnap ? Number(latestSnap.profitRate) : 0
    const diffFromLatest = latestSnap ? summary.totalProfitRate - latestRate : 0
    const hasChart = recentSnapshots.length >= 2

    // Top returns — 평가수익률 상위 4개 (큰 순)
    const topReturns = [...holdings]
        .sort((a, b) => b.profitRate - a.profitRate)
        .slice(0, 4)

    return (
        <div className="max-w-[480px] mx-auto w-full">
            {/* Hero — Big serif amount + ▲ rate */}
            <section className="px-6 pt-3 pb-6">
                <div className="eyebrow mb-2">{todayLabel}</div>
                <div className="hero-serif text-[40px] sm:text-5xl text-foreground numeric">
                    {formatCurrency(displayValue, baseCurrency)}
                </div>
                <div className="flex gap-2 items-center mt-2.5">
                    <UpDown value={summary.totalProfitRate} big />
                    <span className={cn('text-[13px] font-semibold numeric', isProfit ? 'text-profit' : 'text-loss')}>
                        {isProfit ? '+' : ''}{formatCurrency(displayProfit, baseCurrency)}
                    </span>
                </div>
            </section>

            {/* Performance chart — 성과 흐름 */}
            {hasChart && (
                <section className="mx-4 mb-4">
                    <PerformanceChart />
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
