'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { snapshotsApi } from '@/lib/api/client'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { SnapshotBottomPanel } from '@/components/dashboard/snapshots/snapshot-bottom-panel'
import { EmptySnapshotState } from '@/components/dashboard/empty-snapshot-state'
import { Loader2, Camera, Bell, Plus } from 'lucide-react'

interface Snapshot {
    id: string
    snapshotDate: string | Date
    totalValue: string | number | any
    totalCost: string | number | any
    totalProfit: string | number | any
    profitRate: string | number | any
    cashBalance: string | number | any
    holdings: Array<{
        id: string
        stock: { stockName: string }
    }>
    note?: string | null
    exchangeRate?: number
}

interface SnapshotsClientProps {
    initialSnapshots: Snapshot[]
    currentHoldings: any[]
}

function getDisplay(snapshot: Snapshot, language: string) {
    let displayValue = Number(snapshot.totalValue)
    let displayProfit = Number(snapshot.totalProfit)
    let currency: 'KRW' | 'USD' = 'KRW'
    if (language === 'en' && snapshot.exchangeRate) {
        displayValue = displayValue / snapshot.exchangeRate
        displayProfit = displayProfit / snapshot.exchangeRate
        currency = 'USD'
    }
    return { displayValue, displayProfit, currency }
}

// Up/Down with ▲▼ unicode symbols — matches Variation B design
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

export function SnapshotsClient({ initialSnapshots, currentHoldings }: SnapshotsClientProps) {
    const { t, language } = useLanguage()
    const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [activeId, setActiveId] = useState<string | null>(initialSnapshots[0]?.id ?? null)

    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
    const [hasMore, setHasMore] = useState(initialSnapshots.length >= 20)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const observerTarget = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (initialSnapshots.length > 0) {
            setNextCursor(initialSnapshots[initialSnapshots.length - 1].id)
            if (!activeId) setActiveId(initialSnapshots[0].id)
        }
    }, [initialSnapshots, activeId])

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore || !nextCursor) return
        setIsLoadingMore(true)
        try {
            const response = await snapshotsApi.getList(nextCursor)
            if (response.success && response.data) {
                const newSnapshots = response.data
                setSnapshots(prev => [...prev, ...newSnapshots])
                if (response.pagination) {
                    setNextCursor(response.pagination.cursor)
                    setHasMore(response.pagination.hasMore)
                } else {
                    setHasMore(false)
                }
            }
        } catch (err) {
            console.error('Failed to load more snapshots:', err)
        } finally {
            setIsLoadingMore(false)
        }
    }, [nextCursor, hasMore, isLoadingMore])

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore) loadMore()
            },
            { threshold: 1.0 }
        )
        if (observerTarget.current) observer.observe(observerTarget.current)
        return () => observer.disconnect()
    }, [loadMore, hasMore, isLoadingMore])

    const handleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
    }
    const handleClearSelection = () => setSelectedIds([])

    async function handleDelete(id: string, e: React.MouseEvent) {
        e.stopPropagation()
        if (!confirm(t('confirmDelete'))) return
        setDeleting(id)
        try {
            const response = await snapshotsApi.delete(id)
            if (response.success) {
                setSnapshots(prev => prev.filter(s => s.id !== id))
                if (activeId === id) {
                    const remaining = snapshots.filter(s => s.id !== id)
                    setActiveId(remaining[0]?.id ?? null)
                }
            } else {
                alert(response.error?.message || t('deleteFailed'))
            }
        } catch {
            alert(t('networkError'))
        } finally {
            setDeleting(null)
        }
    }

    if (snapshots.length === 0) {
        return (
            <div className="max-w-[420px] mx-auto w-full pb-32">
                <ScreenHeader />
                <Hero t={t} />
                <div className="mx-4 mt-5 border bg-card overflow-hidden">
                    <EmptySnapshotState />
                </div>
            </div>
        )
    }

    const activeSnapshot = snapshots.find(s => s.id === activeId) ?? snapshots[0]
    const activeIndex = snapshots.findIndex(s => s.id === activeSnapshot.id)

    return (
        <div className="max-w-[420px] mx-auto w-full pb-32 relative">
            <ScreenHeader />
            <Hero t={t} />
            <ActiveSnapshotCard
                snapshot={activeSnapshot}
                index={activeIndex}
                language={language}
                t={t}
            />
            <TimelineSection
                snapshots={snapshots}
                activeId={activeSnapshot.id}
                onSelect={setActiveId}
                language={language}
                t={t}
                selectedIds={selectedIds}
                onToggleSelect={handleSelect}
                onDelete={handleDelete}
                deletingId={deleting}
            />

            {hasMore && (
                <div ref={observerTarget} className="py-8 flex justify-center">
                    {isLoadingMore && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">{t('loadingMore')}</span>
                        </div>
                    )}
                </div>
            )}
            {!hasMore && snapshots.length > 0 && (
                <div className="py-8 text-center text-muted-foreground text-xs tracking-wider">
                    — {t('noMoreSnapshots')} —
                </div>
            )}

            {/* FAB — 56px, accent green */}
            <Link
                href="/dashboard/snapshots/new"
                className={cn(
                    'fixed bottom-24 right-5 z-30',
                    'w-14 h-14 rounded-full',
                    'bg-primary text-primary-foreground',
                    'flex items-center justify-center',
                    'shadow-[0_8px_24px_rgba(0,0,0,0.25)]',
                    'transition-transform hover:scale-105 active:scale-95',
                )}
                aria-label={t('newSnapshot')}
                title={t('newSnapshot')}
            >
                <Plus className="w-[22px] h-[22px]" strokeWidth={2.5} />
            </Link>

            <SnapshotBottomPanel
                currentHoldings={currentHoldings}
                snapshots={snapshots}
                selectedIds={selectedIds}
                onClearSelection={handleClearSelection}
            />
        </div>
    )
}

/* ─── Header bar ─── */
function ScreenHeader() {
    return (
        <div className="px-6 pt-3.5 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" strokeWidth={2} />
                <span className="text-base font-bold text-foreground tracking-tight">Snapshot</span>
            </div>
            <Bell className="w-5 h-5 text-muted-foreground" strokeWidth={2} />
        </div>
    )
}

/* ─── Hero — serif headline + italic subtitle ─── */
function Hero({ t }: { t: (k: any) => string }) {
    return (
        <div className="px-6 pt-2 pb-1 flex items-baseline gap-2.5 flex-wrap">
            <h1 className="hero-serif text-[36px] text-foreground m-0">
                {t('snapshots')}
            </h1>
            <span className="serif-italic text-xs text-muted-foreground">
                {t('snapshotsHeroSubtitle')}
            </span>
        </div>
    )
}

/* ─── Active/Latest snapshot detail card ─── */
function ActiveSnapshotCard({
    snapshot, index, language, t,
}: {
    snapshot: Snapshot
    index: number
    language: string
    t: (k: any) => string
}) {
    const { displayValue, displayProfit, currency } = getDisplay(snapshot, language)
    const profitRate = Number(snapshot.profitRate)
    const isProfit = displayProfit >= 0
    const holdingsCount = snapshot.holdings.length
    const labelKey = index === 0 ? 'LATEST · ' + t('latest') : `${index}일 전`
    const sourceLabel = t('autoSnapshotLabel')

    return (
        <div className="mx-4 mt-5 mb-4 relative overflow-hidden border bg-card" style={{ padding: 22 }}>
            {/* 3px accent stripe at top */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary" />

            <div className="flex items-center justify-between mb-1">
                <span className="eyebrow">{labelKey}</span>
                <span className="text-[11px] text-muted-foreground">{sourceLabel}</span>
            </div>

            <div className="font-serif text-[22px] text-foreground mt-1.5" suppressHydrationWarning>
                {formatDate(snapshot.snapshotDate, 'yyyy-MM-dd')}
            </div>
            <div className="text-[11px] text-muted-foreground mb-[18px]">
                <span suppressHydrationWarning>{formatDate(snapshot.snapshotDate, 'HH:mm')}</span>
                {' · '}
                {holdingsCount}{t('countUnit')} {t('stock')}
            </div>

            <div className="text-[11px] font-semibold text-muted-foreground tracking-[0.5px] mb-1">
                {t('totalValue')}
            </div>
            <div className="amount-display text-[30px] text-foreground leading-none">
                {formatCurrency(displayValue, currency)}
            </div>

            <div className="flex gap-4 mt-3.5 items-stretch">
                <div>
                    <div className="text-[10px] font-semibold text-muted-foreground tracking-[0.5px] uppercase">
                        {t('returnRate')}
                    </div>
                    <div className="mt-1"><UpDown value={profitRate} big /></div>
                </div>
                <div className="w-px bg-border self-stretch" />
                <div>
                    <div className="text-[10px] font-semibold text-muted-foreground tracking-[0.5px] uppercase">
                        {t('pl')}
                    </div>
                    <div className={cn('text-[15px] font-bold mt-1 numeric', isProfit ? 'text-profit' : 'text-loss')}>
                        {isProfit ? '+' : ''}{formatCurrency(displayProfit, currency)}
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ─── Timeline list with vertical rail + dots ─── */
function TimelineSection({
    snapshots, activeId, onSelect, language, t, selectedIds, onToggleSelect, onDelete, deletingId,
}: {
    snapshots: Snapshot[]
    activeId: string
    onSelect: (id: string) => void
    language: string
    t: (k: any) => string
    selectedIds: string[]
    onToggleSelect: (id: string, e: React.MouseEvent) => void
    onDelete: (id: string, e: React.MouseEvent) => void
    deletingId: string | null
}) {
    return (
        <>
            <div className="px-6 mb-3">
                <div className="eyebrow">Timeline · {t('timeline')}</div>
            </div>
            <div className="relative px-6">
                {/* vertical rail */}
                <div
                    aria-hidden
                    className="absolute w-px bg-border"
                    style={{ left: 35, top: 8, bottom: 60 }}
                />
                {snapshots.map(s => {
                    const isActive = s.id === activeId
                    const { displayValue, currency } = getDisplay(s, language)
                    const profitRate = Number(s.profitRate)
                    const holdingsCount = s.holdings.length
                    const isSelected = selectedIds.includes(s.id)
                    const deleting = deletingId === s.id

                    return (
                        <div
                            key={s.id}
                            onClick={() => onSelect(s.id)}
                            className={cn(
                                'flex items-start gap-4 py-3 cursor-pointer transition-opacity',
                                isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100',
                            )}
                        >
                            {/* dot */}
                            <div
                                className={cn(
                                    'w-[22px] h-[22px] rounded-full flex-shrink-0 mt-1 relative z-10',
                                    'flex items-center justify-center border-2',
                                    isActive
                                        ? 'bg-primary border-primary'
                                        : 'bg-card border-border',
                                )}
                            >
                                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>

                            {/* card */}
                            <div
                                className={cn(
                                    'flex-1 min-w-0 border bg-card p-3.5',
                                    isSelected && 'ring-1 ring-primary border-primary',
                                )}
                            >
                                <div className="flex justify-between items-baseline">
                                    <span className="font-serif text-sm font-semibold text-foreground" suppressHydrationWarning>
                                        {formatDate(s.snapshotDate, 'yyyy-MM-dd')}
                                    </span>
                                    <UpDown value={profitRate} />
                                </div>
                                <div className="flex justify-between items-baseline mt-1 gap-2">
                                    <span className="text-[11px] text-muted-foreground">
                                        <span suppressHydrationWarning>{formatDate(s.snapshotDate, 'HH:mm')}</span>
                                        {' · '}
                                        {holdingsCount}{t('stock')}
                                    </span>
                                    <span className="text-[13px] font-bold text-foreground numeric">
                                        {formatCurrency(displayValue, currency)}
                                    </span>
                                </div>

                                {/* secondary actions row */}
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
                                    <div className="flex gap-2 items-center">
                                        <Link
                                            href={`/dashboard/snapshots/${s.id}`}
                                            onClick={e => e.stopPropagation()}
                                            className="text-[11px] text-muted-foreground hover:text-foreground"
                                        >
                                            {t('details')}
                                        </Link>
                                        <span className="text-border">|</span>
                                        <Link
                                            href={`/dashboard/simulation?snapshotId=${s.id}`}
                                            onClick={e => e.stopPropagation()}
                                            className="text-[11px] text-muted-foreground hover:text-foreground"
                                        >
                                            {t('simulation')}
                                        </Link>
                                        <span className="text-border">|</span>
                                        <button
                                            onClick={e => onDelete(s.id, e)}
                                            disabled={deleting}
                                            className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
                                        >
                                            {deleting ? t('deleting') : t('delete')}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={e => onToggleSelect(s.id, e)}
                                        className={cn(
                                            'w-4 h-4 border-2 flex items-center justify-center transition-colors',
                                            isSelected
                                                ? 'border-primary bg-primary'
                                                : 'border-muted-foreground/30 hover:border-muted-foreground',
                                        )}
                                        aria-pressed={isSelected}
                                        aria-label="select"
                                    >
                                        {isSelected && (
                                            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    )
}
