'use client'

import Link from 'next/link'
import { Sparkline } from '@/components/dashboard/sparkline'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'

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

    // Sparkline series — chronological order (oldest → newest)
    const series = [...recentSnapshots]
        .reverse()
        .map(s => Number(s.totalValue))

    const latestSnap = recentSnapshots[0]
    const latestRate = latestSnap ? Number(latestSnap.profitRate) : 0
    const diffFromLatest = latestSnap ? summary.totalProfitRate - latestRate : 0

    // Top movers — sorted by abs(profitRate) desc, top 4
    const topMovers = [...holdings]
        .sort((a, b) => Math.abs(b.profitRate) - Math.abs(a.profitRate))
        .slice(0, 4)

    // Sparkline color follows trend
    const sparkColor = isProfit ? 'var(--profit)' : 'var(--loss)'

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

            {/* Sparkline card — 3개월 수익률 */}
            {series.length >= 2 && (
                <section className="mx-4 mb-4 p-5 bg-card border border-border">
                    <div className="flex justify-between items-center mb-2.5">
                        <span className="eyebrow">{language === 'ko' ? '최근 추이' : 'Recent trend'}</span>
                        <UpDown value={summary.totalProfitRate} />
                    </div>
                    <div style={{ color: sparkColor }}>
                        <Sparkline data={series} width={324} height={100} fillColor={sparkColor} showZeroAxis />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1 numeric">
                        {recentSnapshots.length > 0 && (
                            <>
                                <span suppressHydrationWarning>
                                    {formatDate(recentSnapshots[recentSnapshots.length - 1].snapshotDate, 'MM.dd')}
                                </span>
                                <span suppressHydrationWarning>
                                    {formatDate(recentSnapshots[0].snapshotDate, 'MM.dd')}
                                </span>
                            </>
                        )}
                    </div>
                </section>
            )}

            {/* Two-up — 원금 / 누적손익 */}
            <section className="mx-4 mb-4 grid grid-cols-2 gap-2">
                <div className="p-4 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {language === 'ko' ? '원금' : 'Principal'}
                    </div>
                    <div className="font-serif text-lg font-semibold text-foreground mt-1.5 numeric">
                        {formatCurrency(displayCost, baseCurrency)}
                    </div>
                </div>
                <div className="p-4 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {language === 'ko' ? '누적손익' : 'Cumulative'}
                    </div>
                    <div className={cn(
                        'font-serif text-lg font-semibold mt-1.5 numeric',
                        isProfit ? 'text-profit' : 'text-loss',
                    )}>
                        {isProfit ? '+' : ''}{formatCurrency(displayProfit, baseCurrency)}
                    </div>
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
                                {formatDate(latestSnap.snapshotDate, 'yyyy-MM-dd')}
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

            {/* Top movers */}
            {topMovers.length > 0 && (
                <section className="px-6 mb-4">
                    <div className="eyebrow mb-3.5">
                        Top Movers · {language === 'ko' ? '주요 변동' : 'Key changes'}
                    </div>
                    <ul className="divide-y divide-border">
                        {topMovers.map((h, i) => {
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
