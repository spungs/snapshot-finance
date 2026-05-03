'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/lib/i18n/context'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { SnapshotDiff } from './snapshot-diff'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    currentHoldings: any[]
    snapshots: any[]
    selectedIds: string[]
    onClearSelection: () => void
}

// 비교 패널 — modal=false / dismissible=false로 쓰던 vaul Drawer를 일반 fixed div로 교체.
// vaul Drawer는 첫 mount 시 transform 0 → 목표 위치로 트랜지션돼 "보였다가 내려감" 결함이
// 발생했고, 일부 환경에서 body scroll lock이 잡혀 뒤쪽 페이지가 스크롤되지 않는 문제도 있었음.
export function SnapshotBottomPanel({ currentHoldings, snapshots, selectedIds, onClearSelection }: Props) {
    const { t, language } = useLanguage()
    const [expanded, setExpanded] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // 2개 선택될 때 자동으로 펼치기
    useEffect(() => {
        if (selectedIds.length === 2) setExpanded(true)
    }, [selectedIds.length])

    // 2개 선택 시 헤더 요약 계산
    const headerSummary = useMemo(() => {
        if (selectedIds.length !== 2) return null
        const s1 = snapshots.find(s => s.id === selectedIds[0])
        const s2 = snapshots.find(s => s.id === selectedIds[1])
        if (!s1 || !s2) return null

        const [newSn, oldSn] = [s1, s2].sort(
            (a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime(),
        )

        const oldValue = Number(oldSn.totalValue)
        const newValue = Number(newSn.totalValue)
        const valueDiff = newValue - oldValue
        const rateDiff = Number(newSn.profitRate) - Number(oldSn.profitRate)

        const oldDate = formatDate(oldSn.snapshotDate, 'yy.MM.dd')
        const newDate = formatDate(newSn.snapshotDate, 'yy.MM.dd')
        const diffDays = Math.round(
            (new Date(newSn.snapshotDate).getTime() - new Date(oldSn.snapshotDate).getTime()) /
                (1000 * 60 * 60 * 24),
        )

        const currency: 'KRW' | 'USD' = language === 'en' && oldSn.exchangeRate ? 'USD' : 'KRW'
        const rate = language === 'en' && oldSn.exchangeRate ? Number(newSn.exchangeRate) : 1
        const displayDiff = currency === 'USD' ? valueDiff / rate : valueDiff

        const diffLabel = (() => {
            if (diffDays === 1) return language === 'ko' ? '어제보다' : 'vs yesterday'
            if (diffDays === 7) return language === 'ko' ? '일주일 전보다' : 'vs 1 week ago'
            if (diffDays > 0) return language === 'ko' ? `${diffDays}일 전보다` : `vs ${diffDays} days ago`
            return null
        })()

        return { oldDate, newDate, diffDays, valueDiff: displayDiff, rateDiff, currency, diffLabel }
    }, [snapshots, selectedIds, language])

    if (selectedIds.length === 0 || !mounted) return null

    // ── 1개 선택: 플로팅 칩 ──────────────────────────────────────────────────
    if (selectedIds.length === 1) {
        const selectedSnapshot = snapshots.find(s => s.id === selectedIds[0])
        const selectedDate = selectedSnapshot
            ? formatDate(selectedSnapshot.snapshotDate, 'yy.MM.dd')
            : ''

        return createPortal(
            <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-6 pointer-events-none">
                <div
                    className={cn(
                        'flex items-center gap-3 w-full max-w-md',
                        'bg-background border border-border rounded-2xl shadow-xl px-4 h-14',
                        'pointer-events-auto',
                        'animate-in slide-in-from-bottom-4 duration-200',
                    )}
                >
                    <span className="shrink-0 text-[11px] font-semibold bg-primary/10 text-primary rounded-lg px-2.5 py-1">
                        {selectedDate}
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate">
                        {language === 'ko'
                            ? '비교할 스냅샷을 하나 더 선택하세요'
                            : 'Select one more snapshot to compare'}
                    </span>
                    <button
                        type="button"
                        onClick={onClearSelection}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0"
                        aria-label="선택 취소"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>,
            document.body,
        )
    }

    // ── 2개 선택: 풀 바텀 시트 ────────────────────────────────────────────────
    return createPortal(
        <>
            {/* dimmed background — 클릭은 통과 */}
            <div
                aria-hidden
                className={cn(
                    'fixed inset-0 z-40 bg-black/20 pointer-events-none transition-opacity duration-300',
                    expanded ? 'opacity-100' : 'opacity-0',
                )}
            />
            <section
                role="dialog"
                aria-label={t('portfolioComparison')}
                className={cn(
                    'fixed bottom-0 left-0 right-0 z-50',
                    'flex flex-col bg-background border-t shadow-lg',
                    'max-h-[85dvh] md:max-h-[72dvh]',
                    'rounded-t-[1.5rem] md:rounded-t-xl',
                    'transition-transform duration-300 ease-out',
                )}
                style={{
                    transform: expanded ? 'translateY(0)' : 'translateY(calc(100% - 72px))',
                }}
            >
                {/* 핸들 / 헤더 — 탭하면 expand 토글 */}
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    className="sticky top-0 z-10 bg-background border-b w-full text-left hover:bg-muted/50 transition-colors"
                    aria-expanded={expanded}
                >
                    <div className="flex items-start justify-between px-4 py-3 gap-3">
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            {/* 모바일 핸들 바 */}
                            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mb-1 md:hidden mx-auto" />

                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                {t('portfolioComparison')}
                            </span>

                            {headerSummary && (
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-foreground">
                                            {headerSummary.oldDate}
                                            <span className="text-muted-foreground mx-1">→</span>
                                            {headerSummary.newDate}
                                        </span>
                                        {headerSummary.diffDays > 0 && (
                                            <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
                                                {headerSummary.diffDays}일
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {headerSummary.diffLabel && (
                                            <span className="text-[11px] text-muted-foreground">
                                                {headerSummary.diffLabel}
                                            </span>
                                        )}
                                        <span
                                            className={cn(
                                                'text-sm font-bold numeric',
                                                headerSummary.valueDiff >= 0 ? 'text-profit' : 'text-loss',
                                            )}
                                        >
                                            {headerSummary.valueDiff >= 0 ? '+' : ''}
                                            {formatCurrency(headerSummary.valueDiff, headerSummary.currency)}
                                        </span>
                                        <span
                                            className={cn(
                                                'text-[11px] font-semibold numeric',
                                                headerSummary.rateDiff >= 0 ? 'text-profit' : 'text-loss',
                                            )}
                                        >
                                            {headerSummary.rateDiff >= 0 ? '▲' : '▼'}
                                            {Math.abs(headerSummary.rateDiff).toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <span
                            role="button"
                            tabIndex={0}
                            onClick={e => {
                                e.stopPropagation()
                                onClearSelection()
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onClearSelection()
                                }
                            }}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0 inline-flex items-center justify-center cursor-pointer mt-0.5"
                            aria-label={t('hideComparison')}
                        >
                            <X className="w-4 h-4" />
                        </span>
                    </div>
                </button>

                {/* 비교 내용 */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="p-4">
                        <SnapshotDiff
                            currentHoldings={currentHoldings}
                            snapshots={snapshots}
                            selectedIds={selectedIds}
                        />
                    </div>
                </div>
            </section>
        </>,
        document.body,
    )
}
