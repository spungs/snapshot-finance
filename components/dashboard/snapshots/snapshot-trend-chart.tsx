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
} from 'recharts'
import { Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

/** 차트 본문 높이(px). 로딩 스피너 자리와 차트가 반드시 같은 값을 써야
 *  데이터 도착 시 목록이 밀리지 않는다 — 그래서 한 곳에서만 정의한다. */
const CHART_HEIGHT = 190

export type TrendPoint = {
    id: string
    date: string
    /** 총자산(주식+예수금) — 원화 */
    totalAsset: number
    profitRate: number
}

type Mode = 'asset' | 'rate'

interface Props {
    /** 그릴 점들. 날짜 오름차순으로 들어온다고 가정하지 않고 내부에서 정렬한다. */
    points: TrendPoint[]
    /** 선택 모드인지 — 헤더 문구만 달라진다. */
    isSelection: boolean
    /**
     * 시계열을 아직 받아오는 중. 차트와 **같은 껍데기**(섹션·헤더·190px 본문)를 그리고
     * 본문 자리에만 스피너를 돌린다 — 자리를 미리 잡아 데이터 도착 시 목록이 밀리지 않게.
     * 껍데기를 별도 스켈레톤 컴포넌트로 빼지 않은 이유: 두 벌이 되면 한쪽만 바뀌어
     * 높이가 어긋난다. 같은 컴포넌트에서 나오면 어긋날 수가 없다.
     */
    loading?: boolean
    language: string
}

function TrendTooltip({ active, payload, mode }: {
    active?: boolean
    payload?: Array<{ payload: TrendPoint & { label: string } }>
    mode: Mode
}) {
    if (!active || !payload?.length) return null
    const p = payload[0].payload
    return (
        <div className="rounded-lg bg-popover px-3 py-2 shadow-lg border border-border">
            <div className="text-[0.6875rem] text-muted-foreground">{p.label}</div>
            <div className="text-[0.8125rem] font-bold text-foreground numeric mt-0.5">
                {mode === 'asset'
                    ? formatCurrency(p.totalAsset, 'KRW')
                    : `${p.profitRate >= 0 ? '+' : ''}${p.profitRate.toFixed(2)}%`}
            </div>
        </div>
    )
}

/**
 * 선택한 스냅샷들의 추이. 선택이 없으면 현재 목록 구간을 그린다.
 *
 * 홈의 PerformanceChart 와 달리 "임의의 시점 몇 개"를 잇는 것이 목적이라
 * 점을 항상 표시하고 X축은 균등 간격(카테고리)으로 둔다 — 2022년과 2025년만 고른
 * 경우 시간 비례 축으로 그리면 두 점이 양 끝에 몰려 변화를 읽기 어렵다.
 */
export function SnapshotTrendChart({ points, isSelection, loading = false, language }: Props) {
    const ko = language === 'ko'
    const [mode, setMode] = useState<Mode>('asset')

    const data = useMemo(() => {
        return [...points]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map((p) => ({ ...p, label: formatDate(p.date, 'yy.MM.dd') }))
    }, [points])

    // 로딩 중이면 빈 데이터여도 자리를 잡는다. 로딩이 끝났는데 비어 있으면
    // 그릴 게 없는 것이므로 빈 박스를 남기지 않고 접는다.
    if (data.length === 0 && !loading) return null

    const isUp = data.length >= 2
        ? (mode === 'asset'
            ? data[data.length - 1].totalAsset >= data[0].totalAsset
            : data[data.length - 1].profitRate >= data[0].profitRate)
        : true
    const color = isUp ? 'var(--color-profit, #e11d48)' : 'var(--color-loss, #2563eb)'

    const tabCls = (active: boolean) =>
        cn(
            'text-[0.6875rem] font-bold tracking-wide px-2.5 py-1 rounded-md transition-colors',
            active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        )

    return (
        <section className="mx-4 mb-4 rounded-2xl bg-card p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="eyebrow">
                    {isSelection && !loading
                        ? (ko ? `선택 ${data.length}개 추이` : `${data.length} selected`)
                        : (ko ? '기간 추이' : 'Trend')}
                </span>
                <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
                    <button type="button" className={tabCls(mode === 'asset')} onClick={() => setMode('asset')}>
                        {ko ? '자산' : 'Assets'}
                    </button>
                    <button type="button" className={tabCls(mode === 'rate')} onClick={() => setMode('rate')}>
                        {ko ? '수익률' : 'Return'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div
                    style={{ height: CHART_HEIGHT }}
                    className="flex items-center justify-center"
                    role="status"
                    aria-label={ko ? '추이 불러오는 중' : 'Loading trend'}
                >
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={8}
                    />
                    <YAxis
                        tickFormatter={(v: number) =>
                            mode === 'asset'
                                ? `${Math.round(v / 1_000_000)}M`
                                : `${v.toFixed(0)}%`
                        }
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        width={44}
                    />
                    <Tooltip
                        content={<TrendTooltip mode={mode} />}
                        cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Line
                        type="monotone"
                        dataKey={mode === 'asset' ? 'totalAsset' : 'profitRate'}
                        stroke={color}
                        strokeWidth={2}
                        // 점이 적을 때(2~10개)가 주 용도라 마커를 보여주지만,
                        // 전체 기간(수백 개)에서는 점이 뭉개지므로 선만 그린다.
                        dot={data.length <= 40 ? { r: 3, fill: color, strokeWidth: 0 } : false}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
            )}
        </section>
    )
}
