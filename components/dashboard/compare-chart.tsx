'use client'

import { useMemo, useState } from 'react'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts'
import { BarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { ChartDataPoint } from '@/lib/services/snapshot-service'
import {
    buildCompareRows,
    kstDateKey,
    periodStart,
    type CompareMetric,
    type ComparePeriod,
    type CompareRow,
} from '@/lib/utils/compare-series'

// 선 색 — 수익(빨강)/손실(파랑) 색과 겹치지 않는 차트 토큰. 테마 전환에 자동 추종.
const SERIES_COLORS = ['var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

const PERIODS: ComparePeriod[] = ['1M', '3M', '6M', '1Y', 'ALL']
const PERIOD_LABELS: Record<ComparePeriod, { ko: string; en: string }> = {
    '1M': { ko: '1개월', en: '1M' },
    '3M': { ko: '3개월', en: '3M' },
    '6M': { ko: '6개월', en: '6M' },
    '1Y': { ko: '1년', en: '1Y' },
    'ALL': { ko: '전체', en: 'All' },
}

export interface CompareSeries {
    userId: string
    name: string | null       // owner 표시명. 나(isSelf)는 null — 라벨은 언어에 맞춰 '나'/'Me'
    isSelf: boolean
    points: ChartDataPoint[]  // 날짜 오름차순
}

interface CompareChartProps {
    series: CompareSeries[]
    exchangeRate: number      // USD 표시 모드 환산용 (서버 실환율)
}

interface TooltipEntry {
    name?: string
    value?: number | null
    color?: string
}

function CompareTooltip({ active, payload, label, format }: {
    active?: boolean
    payload?: TooltipEntry[]
    label?: string
    format: (v: number) => string
}) {
    if (!active || !payload || payload.length === 0) return null
    const entries = payload.filter((p) => typeof p.value === 'number')
    if (entries.length === 0) return null
    return (
        <div className="bg-card border border-border/60 rounded-xl p-3 shadow-xl text-sm min-w-[168px]">
            <p className="text-muted-foreground text-xs mb-2 font-medium">
                {label ? label.replace(/-/g, '.') : ''}
            </p>
            <div className="space-y-1">
                {entries.map((p) => (
                    <div key={p.name} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                            <span className="text-xs text-muted-foreground truncate">{p.name}</span>
                        </span>
                        <span className="text-xs font-bold numeric text-foreground">{format(p.value as number)}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function formatAssetTick(v: number, currency: string): string {
    if (currency === 'KRW') {
        if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`
        if (v >= 10000) return `${(v / 10000).toFixed(0)}만`
        return String(v)
    }
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`
    return `$${v}`
}

export function CompareChart({ series, exchangeRate }: CompareChartProps) {
    const { language, t } = useLanguage()
    const { baseCurrency } = useCurrency()
    const [metric, setMetric] = useState<CompareMetric>('profitRate')
    const [period, setPeriod] = useState<ComparePeriod>('3M')

    const labels = series.map((s) => (s.isSelf ? (language === 'ko' ? '나' : 'Me') : (s.name ?? '')))
    // 총자산은 원화 저장값 — USD 표시 모드면 실환율로 나눈다. 수익률은 통화와 무관.
    const assetDivisor = baseCurrency === 'USD' ? exchangeRate : 1

    const rows = useMemo<CompareRow[]>(() => {
        const base = buildCompareRows(series.map((s) => s.points), metric, periodStart(period))
        if (metric !== 'totalAsset' || assetDivisor === 1) return base
        return base.map((r) => ({ ...r, values: r.values.map((v) => (v === null ? null : v / assetDivisor)) }))
    }, [series, metric, period, assetDivisor])

    const formatValue = (v: number) =>
        metric === 'profitRate' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : formatCurrency(v, baseCurrency)

    const toggleClass = (selected: boolean) => cn(
        'px-2.5 py-1 whitespace-nowrap rounded-md transition-colors',
        selected
            ? 'bg-card text-foreground font-bold shadow-sm'
            : 'text-muted-foreground font-medium hover:text-foreground',
    )

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full">
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[2rem] text-foreground">{t('moreCompareTitle')}</h1>
            </section>

            <div className="px-4">
                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-row items-center gap-2 flex-wrap">
                            <div
                                role="group"
                                aria-label={language === 'ko' ? '차트 메트릭 선택' : 'Chart metric'}
                                className="flex rounded-lg bg-secondary p-0.5 text-xs"
                            >
                                <button type="button" aria-pressed={metric === 'profitRate'} onClick={() => setMetric('profitRate')} className={toggleClass(metric === 'profitRate')}>
                                    {language === 'ko' ? '수익률' : 'Return'}
                                </button>
                                <button type="button" aria-pressed={metric === 'totalAsset'} onClick={() => setMetric('totalAsset')} className={toggleClass(metric === 'totalAsset')}>
                                    {language === 'ko' ? '자산' : 'Asset'}
                                </button>
                            </div>
                            <div
                                role="group"
                                aria-label={language === 'ko' ? '기간 선택' : 'Period'}
                                className="flex rounded-lg bg-secondary p-0.5 text-xs"
                            >
                                {PERIODS.map((p) => (
                                    <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={toggleClass(period === p)}>
                                        {PERIOD_LABELS[p][language as 'ko' | 'en']}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent>
                        {rows.length === 0 ? (
                            <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                                <BarChart2 className="h-8 w-8 opacity-30" />
                                <p>{language === 'ko' ? '이 기간에 스냅샷이 없습니다.' : 'No snapshots in this period.'}</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                                    <XAxis
                                        dataKey="dateKey"
                                        tickFormatter={(k: string) => k.slice(5).replace('-', '.')}
                                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                        tickLine={false}
                                        axisLine={false}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        tickFormatter={(v: number) => (metric === 'profitRate' ? `${v.toFixed(1)}%` : formatAssetTick(v, baseCurrency))}
                                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                        tickLine={false}
                                        axisLine={false}
                                        domain={['auto', 'auto']}
                                        width={metric === 'profitRate' ? 52 : 56}
                                    />
                                    <Tooltip
                                        content={<CompareTooltip format={formatValue} />}
                                        cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    />
                                    {metric === 'profitRate' && (
                                        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />
                                    )}
                                    {series.map((s, i) => (
                                        <Line
                                            key={s.userId}
                                            type="monotoneX"
                                            dataKey={(r: CompareRow) => r.values[i]}
                                            name={labels[i]}
                                            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                                            strokeWidth={1.75}
                                            dot={false}
                                            activeDot={{ r: 4, strokeWidth: 0 }}
                                            connectNulls
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        )}

                        {/* 사람별 요약 — 기간 필터와 무관하게 항상 최신 스냅샷 기준 */}
                        <div className="mt-4 divide-y divide-border">
                            {series.map((s, i) => {
                                const last = s.points[s.points.length - 1]
                                // SSR(UTC)·브라우저(KST)가 같은 글자를 내도록 KST 고정 — 차트 X축 키와도 일치
                                const lastDay = last ? kstDateKey(last.date).slice(5).replace('-', '.') : ''
                                return (
                                    <div key={s.userId} className="flex items-center justify-between gap-3 py-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                                            <span className="text-sm font-semibold text-foreground truncate">{labels[i]}</span>
                                        </div>
                                        {last ? (
                                            <div className="flex items-baseline gap-3 shrink-0 numeric text-sm">
                                                <span className={cn('font-bold', last.profitRate >= 0 ? 'text-profit' : 'text-loss')}>
                                                    {last.profitRate >= 0 ? '+' : ''}{last.profitRate.toFixed(2)}%
                                                </span>
                                                <span className="text-foreground">
                                                    {formatCurrency(last.totalAsset / assetDivisor, baseCurrency)}
                                                </span>
                                                <span className="text-[0.6875rem] text-muted-foreground">
                                                    {language === 'ko' ? `${lastDay} 기준` : `as of ${lastDay}`}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">
                                                {language === 'ko' ? '스냅샷 없음' : 'No snapshots'}
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
