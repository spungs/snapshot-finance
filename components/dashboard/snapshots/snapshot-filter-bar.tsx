'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export type DateRange = { from: string; to: string }

/** 오늘 기준 프리셋. UTC 기준으로 계산해 서버의 범위 해석과 맞춘다. */
export function presetRange(kind: '1m' | '3m' | '1y' | 'all', earliest?: string): DateRange {
    const now = new Date()
    const to = now.toISOString().split('T')[0]
    if (kind === 'all') {
        return { from: earliest ?? '2000-01-01', to }
    }
    const d = new Date(now)
    if (kind === '1m') d.setUTCMonth(d.getUTCMonth() - 1)
    else if (kind === '3m') d.setUTCMonth(d.getUTCMonth() - 3)
    else d.setUTCFullYear(d.getUTCFullYear() - 1)
    return { from: d.toISOString().split('T')[0], to }
}

interface Props {
    range: DateRange | null
    onChange: (range: DateRange | null) => void
    /** 스냅샷이 존재하는 연도 목록 (내림차순). 연도 칩으로 노출한다. */
    years: number[]
    earliest?: string
    disabled?: boolean
    language: string
}

export function SnapshotFilterBar({ range, onChange, years, earliest, disabled, language }: Props) {
    const ko = language === 'ko'
    const today = useMemo(() => new Date().toISOString().split('T')[0], [])

    const chip = (active: boolean) =>
        cn(
            'rounded-full px-3 py-1 text-[0.75rem] font-semibold transition-colors disabled:opacity-40',
            active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
        )

    // 연도 칩: 그 해 1/1 ~ 12/31
    const yearRange = (y: number): DateRange => ({ from: `${y}-01-01`, to: `${y}-12-31` })
    const isYearActive = (y: number) => range?.from === `${y}-01-01` && range?.to === `${y}-12-31`

    const setPart = (part: 'from' | 'to', value: string) => {
        const base = range ?? { from: earliest ?? '2000-01-01', to: today }
        const next = { ...base, [part]: value }
        // from > to 면 사용자가 방금 고친 쪽을 기준으로 반대편을 맞춘다.
        if (next.from > next.to) {
            if (part === 'from') next.to = next.from
            else next.from = next.to
        }
        onChange(next)
    }

    return (
        <div className="px-6 pb-3 space-y-2">
            {/* 프리셋 + 연도 */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button type="button" disabled={disabled} className={chip(range === null)} onClick={() => onChange(null)}>
                    {ko ? '전체' : 'All'}
                </button>
                <button type="button" disabled={disabled} className={chip(false)} onClick={() => onChange(presetRange('1m'))}>
                    {ko ? '1개월' : '1M'}
                </button>
                <button type="button" disabled={disabled} className={chip(false)} onClick={() => onChange(presetRange('3m'))}>
                    {ko ? '3개월' : '3M'}
                </button>
                <button type="button" disabled={disabled} className={chip(false)} onClick={() => onChange(presetRange('1y'))}>
                    {ko ? '1년' : '1Y'}
                </button>
                <span className="w-px h-4 bg-border shrink-0" />
                {years.map((y) => (
                    <button
                        key={y}
                        type="button"
                        disabled={disabled}
                        className={cn(chip(isYearActive(y)), 'shrink-0')}
                        onClick={() => onChange(yearRange(y))}
                    >
                        {y}
                    </button>
                ))}
            </div>

            {/* 직접 지정 */}
            <div className="flex items-center gap-1.5">
                <input
                    type="date"
                    max={today}
                    disabled={disabled}
                    value={range?.from ?? ''}
                    onChange={(e) => e.target.value && setPart('from', e.target.value)}
                    className="flex-1 min-w-0 rounded-lg bg-card px-2.5 py-1.5 text-[0.75rem] font-medium text-foreground numeric outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                    aria-label={ko ? '시작일' : 'Start date'}
                />
                <span className="text-[0.75rem] text-muted-foreground shrink-0">~</span>
                <input
                    type="date"
                    max={today}
                    disabled={disabled}
                    value={range?.to ?? ''}
                    onChange={(e) => e.target.value && setPart('to', e.target.value)}
                    className="flex-1 min-w-0 rounded-lg bg-card px-2.5 py-1.5 text-[0.75rem] font-medium text-foreground numeric outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                    aria-label={ko ? '종료일' : 'End date'}
                />
                {range && (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        disabled={disabled}
                        className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                        aria-label={ko ? '기간 초기화' : 'Clear range'}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    )
}
