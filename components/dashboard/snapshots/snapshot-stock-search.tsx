'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'

export type SnapshotStock = { stockCode: string; nameKo: string; nameEn: string | null }

const MAX_RESULTS = 8

/** 소문자 + 공백 제거 — '메타플랫폼스'로 쳐도 '메타 플랫폼스(페이스북)'이 걸리게 한다. */
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '')

interface Props {
    /** 내 스냅샷에 한 번이라도 담긴 종목. 매도해 잔고에 없는 종목도 포함된다. */
    stocks: SnapshotStock[]
    selected: SnapshotStock | null
    onSelect: (stock: SnapshotStock | null) => void
    onClose: () => void
    disabled?: boolean
    language: string
}

/**
 * 스냅샷 목록의 종목 필터. 후보가 이미 손에 있으므로 서버 검색 없이 클라이언트에서 거른다.
 * 고르기 전엔 검색 입력, 고른 뒤엔 해제 가능한 칩으로 보인다.
 */
export function SnapshotStockSearch({ stocks, selected, onSelect, onClose, disabled, language }: Props) {
    const ko = language === 'ko'
    const [query, setQuery] = useState('')

    const matches = useMemo(() => {
        const q = normalize(query)
        if (!q) return []
        const hits: { stock: SnapshotStock; prefix: boolean }[] = []
        for (const s of stocks) {
            const fields = [s.nameKo, s.nameEn ?? '', s.stockCode].map(normalize)
            if (!fields.some(f => f.includes(q))) continue
            hits.push({ stock: s, prefix: fields.some(f => f.startsWith(q)) })
        }
        // 앞부분이 맞는 종목을 위로 — 'tsla', '엔비'처럼 앞에서부터 치는 경우가 대부분이다.
        return hits
            .sort((a, b) => Number(b.prefix) - Number(a.prefix))
            .slice(0, MAX_RESULTS)
            .map(h => h.stock)
    }, [query, stocks])

    const pick = (s: SnapshotStock) => {
        setQuery('')
        onSelect(s)
    }

    if (selected) {
        return (
            <div className="px-6 pb-3">
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary text-primary-foreground pl-3 pr-1 py-1 text-[0.75rem] font-semibold">
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{selected.nameKo}</span>
                    <span className="shrink-0 opacity-70 numeric">{selected.stockCode}</span>
                    <button
                        type="button"
                        onClick={() => onSelect(null)}
                        disabled={disabled}
                        className="shrink-0 p-1 rounded-full hover:bg-white/15 disabled:opacity-40"
                        aria-label={ko ? '종목 필터 해제' : 'Clear stock filter'}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="px-6 pb-3">
            <div className="flex items-center gap-2 rounded-lg bg-card px-2.5 focus-within:ring-1 focus-within:ring-primary">
                <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                {/* 모바일 16px — iOS 는 16px 미만 입력칸에 포커스하면 화면을 확대한다. */}
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && matches[0]) pick(matches[0])
                        else if (e.key === 'Escape') onClose()
                    }}
                    disabled={disabled}
                    placeholder={ko ? '종목명 또는 티커 (예: 테슬라, TSLA)' : 'Name or ticker (e.g. TSLA)'}
                    className="flex-1 min-w-0 bg-transparent py-1.5 text-base md:text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-40"
                    aria-label={ko ? '종목 검색' : 'Search stock'}
                />
                <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 p-1 -mr-1 text-muted-foreground hover:text-foreground"
                    aria-label={ko ? '검색 닫기' : 'Close search'}
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {query.trim() && (
                <ul className="mt-1.5 rounded-lg bg-card overflow-hidden">
                    {matches.length === 0 ? (
                        <li className="px-3 py-2.5 text-[0.75rem] text-muted-foreground">
                            {ko ? '일치하는 종목이 없어요' : 'No matching stock'}
                        </li>
                    ) : (
                        matches.map(s => (
                            <li key={s.stockCode}>
                                <button
                                    type="button"
                                    onClick={() => pick(s)}
                                    className="w-full flex items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent-soft transition-colors"
                                >
                                    <span className="truncate text-[0.8125rem] font-semibold text-foreground">{s.nameKo}</span>
                                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground numeric">{s.stockCode}</span>
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    )
}
