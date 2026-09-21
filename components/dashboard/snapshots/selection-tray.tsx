'use client'

import { formatDate } from '@/lib/utils/formatters'
import { X, GitCompareArrows } from 'lucide-react'

interface Props {
    /** 선택된 스냅샷 (날짜 오름차순). 목록 밖 항목도 포함된다. */
    selected: Array<{ id: string; snapshotDate: string }>
    max: number
    onRemove: (id: string) => void
    onClear: () => void
    onCompare: () => void
    language: string
}

/**
 * 선택 트레이 — 지금 무엇을 고른 상태인지 항상 보이게 한다.
 *
 * 기간 필터를 바꾸면 고른 항목이 목록에서 사라지므로(2022년을 고른 뒤 2025년으로 이동),
 * 선택 자체는 여기에서만 확인·해제할 수 있다.
 */
export function SelectionTray({ selected, max, onRemove, onClear, onCompare, language }: Props) {
    const ko = language === 'ko'
    if (selected.length === 0) return null

    return (
        <section className="mx-4 mb-4 rounded-2xl bg-card p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="eyebrow">
                    {ko ? `선택 ${selected.length}/${max}` : `Selected ${selected.length}/${max}`}
                </span>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-[0.6875rem] font-semibold text-muted-foreground hover:text-foreground"
                >
                    {ko ? '모두 해제' : 'Clear'}
                </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {selected.map((s) => (
                    <span
                        key={s.id}
                        className="inline-flex items-center gap-1 rounded-full bg-muted/50 pl-2.5 pr-1 py-1 text-[0.71875rem] font-semibold text-foreground numeric"
                    >
                        {formatDate(s.snapshotDate, 'yy.MM.dd')}
                        <button
                            type="button"
                            onClick={() => onRemove(s.id)}
                            className="p-0.5 text-muted-foreground hover:text-destructive"
                            aria-label={ko ? '선택 해제' : 'Remove'}
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </span>
                ))}
            </div>

            <button
                type="button"
                onClick={onCompare}
                disabled={selected.length < 2}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-[0.8125rem] font-bold text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
                <GitCompareArrows className="w-4 h-4" />
                {selected.length < 2
                    ? (ko ? '2개 이상 선택하세요' : 'Select 2 or more')
                    : (ko ? `${selected.length}개 비교하기` : `Compare ${selected.length}`)}
            </button>
        </section>
    )
}
