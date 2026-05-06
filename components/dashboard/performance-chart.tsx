'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/formatters'
import { formatDate } from '@/lib/utils/formatters'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { TrendingUp, TrendingDown, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

type Period = '1M' | '3M' | '6M' | '1Y' | 'ALL'
type ChartMode = 'profitRate' | 'totalAsset'

interface ChartDataPoint {
  date: string
  totalValue: number
  totalCost: number
  totalProfit: number
  profitRate: number
  cashBalance: number
  totalAsset: number
}

const PERIOD_LABELS: Record<Period, { ko: string; en: string }> = {
  '1M': { ko: '1개월', en: '1M' },
  '3M': { ko: '3개월', en: '3M' },
  '6M': { ko: '6개월', en: '6M' },
  '1Y': { ko: '1년', en: '1Y' },
  'ALL': { ko: '전체', en: 'All' },
}

const PERIODS: Period[] = ['1M', '3M', '6M', '1Y', 'ALL']

// CSS 변수에서 실제 색상값 읽기 (SSR 안전)
const PROFIT_COLOR = '#f43f5e'
const LOSS_COLOR = '#3b82f6'

function CustomTooltip({ active, payload, mode, currency, exchangeRate }: any) {
  const { language } = useLanguage()
  if (!active || !payload || !payload.length) return null

  const d = payload[0]?.payload
  if (!d) return null

  const isProfit = d.profitRate >= 0

  return (
    <div className="bg-card border border-border/60 rounded-xl p-3 shadow-xl text-sm min-w-[168px]"
      style={{
        boxShadow: '0 8px 32px hsl(224 71% 4% / 0.45), inset 0 1px 0 hsl(224 71% 38% / 0.1)',
      }}
    >
      <p className="text-muted-foreground text-xs mb-2 font-medium">
        {formatDate(d.date, 'yyyy.MM.dd')}
      </p>
      {mode === 'profitRate' ? (
        <>
          <p className={cn('font-bold text-base numeric', isProfit ? 'text-profit' : 'text-loss')}>
            {isProfit ? '+' : ''}{d.profitRate.toFixed(2)}%
          </p>
          <p className="text-muted-foreground text-xs mt-1.5">
            {language === 'ko' ? '평가손익' : 'P/L'}:{' '}
            <span className={cn('font-medium', isProfit ? 'text-profit' : 'text-loss')}>
              {isProfit ? '+' : ''}{formatCurrency(d.totalProfit / (currency === 'USD' ? exchangeRate : 1), currency)}
            </span>
          </p>
        </>
      ) : (
        <>
          <p className="font-bold text-base text-primary numeric">
            {formatCurrency(d.totalAsset / (currency === 'USD' ? exchangeRate : 1), currency)}
          </p>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-muted-foreground text-xs numeric">
              {language === 'ko' ? '주식' : 'Stock'}: {formatCurrency(d.totalValue / (currency === 'USD' ? exchangeRate : 1), currency)}
            </p>
            <p className="text-muted-foreground text-xs numeric">
              {language === 'ko' ? '예수금' : 'Cash'}: {formatCurrency(d.cashBalance / (currency === 'USD' ? exchangeRate : 1), currency)}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

interface PerformanceChartProps {
  initialChartData?: ChartDataPoint[]
}

// 기간(period) 별 시작일 계산 — 메모리 필터용. 모든 period 가 동일 SWR 캐시
// 항목을 공유하므로 토글 시 추가 API 호출 없이 즉시 반응한다.
function startDateForPeriod(period: Period): Date | null {
  const now = new Date()
  switch (period) {
    case '1M': { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d }
    case '3M': { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d }
    case '6M': { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d }
    case '1Y': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d }
    case 'ALL':
    default: return null
  }
}

export function PerformanceChart({ initialChartData }: PerformanceChartProps) {
  const { language } = useLanguage()
  const { baseCurrency } = useCurrency()
  const [period, setPeriod] = useState<Period>('3M')
  const [mode, setMode] = useState<ChartMode>('profitRate')
  const exchangeRate = 1435

  // SWR — 서버에서 prefetch 된 initialChartData 를 fallback 으로 사용해 첫 페인트
  // 부터 차트가 보인다. 이후엔 stale-while-revalidate 패턴으로 백그라운드 재검증.
  const { data: allData, error, isLoading } = useSWR<ChartDataPoint[]>(
    '/api/snapshots/chart-data',
    {
      fallbackData: initialChartData,
      revalidateOnMount: !initialChartData, // SSR 데이터가 있으면 마운트 즉시 재검증 생략
    }
  )

  const data = useMemo<ChartDataPoint[]>(() => {
    if (!allData) return []
    const fromDate = startDateForPeriod(period)
    if (!fromDate) return allData
    return allData.filter((d) => new Date(d.date) >= fromDate)
  }, [allData, period])

  const loading = isLoading && !allData
  const errorMsg = error ? (language === 'ko' ? '차트 데이터를 불러오지 못했습니다.' : 'Failed to load chart data.') : null

  const firstPoint = data[0]
  const lastPoint = data[data.length - 1]
  const periodChange = data.length >= 2
    ? lastPoint.profitRate - firstPoint.profitRate
    : null
  const isUp = (lastPoint?.profitRate ?? 0) >= 0

  const formattedData = data.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date, 'MM.dd'),
    displayValue: mode === 'profitRate' ? d.profitRate : d.totalAsset / (baseCurrency === 'USD' ? exchangeRate : 1),
  }))

  const isEmpty = !loading && data.length === 0
  const areaColor = isUp ? PROFIT_COLOR : LOSS_COLOR

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">
              {language === 'ko' ? '성과 흐름' : 'Performance trend'}
            </CardTitle>
            {!loading && lastPoint && (
              <Badge variant={isUp ? 'profit' : 'loss'} className="text-xs font-semibold">
                {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {isUp ? '+' : ''}{lastPoint.profitRate.toFixed(2)}%
              </Badge>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden text-xs self-start sm:self-auto">
              <button
                onClick={() => setMode('profitRate')}
                className={cn(
                  'px-2.5 py-1 transition-colors',
                  mode === 'profitRate'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {language === 'ko' ? '수익률' : 'Return'}
              </button>
              <button
                onClick={() => setMode('totalAsset')}
                className={cn(
                  'px-2.5 py-1 transition-colors',
                  mode === 'totalAsset'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {language === 'ko' ? '자산' : 'Asset'}
              </button>
            </div>

            <div className="flex rounded-md border border-border overflow-hidden text-xs self-start sm:self-auto">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'px-2.5 py-1 transition-colors',
                    period === p
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {PERIOD_LABELS[p][language as 'ko' | 'en']}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <Skeleton className="h-[240px] w-full rounded-md" />
        ) : errorMsg ? (
          <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
            {errorMsg}
          </div>
        ) : isEmpty ? (
          <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
            <BarChart2 className="h-8 w-8 opacity-30" />
            <p>{language === 'ko' ? '스냅샷을 저장하면 차트가 표시됩니다.' : 'Save snapshots to see the chart.'}</p>
          </div>
        ) : (
          <>
            {periodChange !== null && data.length >= 2 && (
              <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                <span>
                  {language === 'ko' ? '기간 변화' : 'Period Change'}:&nbsp;
                  <span className={cn('font-semibold numeric', periodChange >= 0 ? 'text-profit' : 'text-loss')}>
                    {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}%p
                  </span>
                </span>
                <span>
                  {language === 'ko' ? `스냅샷 ${data.length}개` : `${data.length} snapshots`}
                </span>
              </div>
            )}

            <ResponsiveContainer width="100%" height={240}>
              {mode === 'profitRate' ? (
                <AreaChart data={formattedData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PROFIT_COLOR} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={PROFIT_COLOR} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradLoss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={LOSS_COLOR} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={LOSS_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    width={52}
                  />
                  <Tooltip
                    content={<CustomTooltip mode={mode} currency={baseCurrency} exchangeRate={exchangeRate} />}
                    cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Area
                    type="monotoneX"
                    dataKey="profitRate"
                    stroke={areaColor}
                    strokeWidth={1.5}
                    fill={isUp ? 'url(#gradProfit)' : 'url(#gradLoss)'}
                    dot={false}
                    activeDot={{ r: 4, fill: areaColor, strokeWidth: 0 }}
                  />
                </AreaChart>
              ) : (
                <AreaChart data={formattedData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradAsset" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PROFIT_COLOR} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={PROFIT_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => {
                      if (baseCurrency === 'KRW') {
                        if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`
                        if (v >= 10000) return `${(v / 10000).toFixed(0)}만`
                        return String(v)
                      }
                      if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
                      if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`
                      return `$${v}`
                    }}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    domain={['dataMin - dataMin * 0.02', 'dataMax + dataMax * 0.02']}
                    width={56}
                  />
                  <Tooltip
                    content={<CustomTooltip mode={mode} currency={baseCurrency} exchangeRate={exchangeRate} />}
                    cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotoneX"
                    dataKey="displayValue"
                    stroke={PROFIT_COLOR}
                    strokeWidth={1.5}
                    fill="url(#gradAsset)"
                    dot={false}
                    activeDot={{ r: 4, fill: PROFIT_COLOR, strokeWidth: 0 }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  )
}
