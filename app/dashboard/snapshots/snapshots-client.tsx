'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { snapshotsApi } from '@/lib/api/client'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { SnapshotBottomPanel } from '@/components/dashboard/snapshots/snapshot-bottom-panel'
import { EmptySnapshotState } from '@/components/dashboard/empty-snapshot-state'
import { Loader2, Plus, MoreVertical, Eye, TrendingUp, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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
    const router = useRouter()
    const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [activeId, setActiveId] = useState<string | null>(initialSnapshots[0]?.id ?? null)

    // 부모 server component 가 router.refresh() 후 새 props 로 재렌더되면
    // useState 초기값은 마운트 시 1회만 적용되므로 자동 동기화 안 됨.
    // 명시적으로 props 변경을 감지해 state 갱신.
    useEffect(() => {
        setSnapshots(initialSnapshots)
    }, [initialSnapshots])

    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
    const [hasMore, setHasMore] = useState(initialSnapshots.length >= 20)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const observerTarget = useRef<HTMLDivElement>(null)
    const loadMoreAbortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        if (initialSnapshots.length > 0) {
            setNextCursor(initialSnapshots[initialSnapshots.length - 1].id)
            if (!activeId) setActiveId(initialSnapshots[0].id)
        }
        // initialSnapshots 가 줄어들거나(삭제) 늘어나면 hasMore 도 재평가
        setHasMore(initialSnapshots.length >= 20)
    }, [initialSnapshots, activeId])

    // Cancel any in-flight pagination fetch when the component unmounts (e.g., tab switch)
    useEffect(() => () => loadMoreAbortRef.current?.abort(), [])

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore || !nextCursor) return

        loadMoreAbortRef.current?.abort()
        const controller = new AbortController()
        loadMoreAbortRef.current = controller

        setIsLoadingMore(true)
        try {
            const response = await snapshotsApi.getList(nextCursor, controller.signal)
            if (controller.signal.aborted) return
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
            if ((err as Error).name === 'AbortError') return
            console.error('Failed to load more snapshots:', err)
        } finally {
            if (!controller.signal.aborted) setIsLoadingMore(false)
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

    const handleActiveSelect = useCallback((id: string) => {
        setActiveId(id)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [])

    const handleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        // toast/side-effect는 setState reducer 안이 아니라 바깥에서 처리한다 — React strict
        // mode에서 reducer가 두 번 호출돼 토스트가 중복 발사되던 문제 해소.
        if (selectedIds.includes(id)) {
            setSelectedIds(prev => prev.filter(p => p !== id))
            return
        }
        if (selectedIds.length >= 2) {
            toast.info(
                language === 'ko'
                    ? '비교는 2개를 선택했을 때만 가능해요'
                    : 'Compare works with exactly 2 snapshots',
                { id: 'snapshot-compare-limit' },
            )
            return
        }
        setSelectedIds(prev => [...prev, id])
    }
    const handleClearSelection = () => setSelectedIds([])

    // 삭제 확인: native confirm() 대신 ConfirmDialog 사용 (UX 일관성)
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

    function handleDelete(id: string, e: React.MouseEvent) {
        e.stopPropagation()
        setDeleteTargetId(id)
    }

    async function performDelete() {
        if (!deleteTargetId) return
        const id = deleteTargetId
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
                toast.error(response.error?.message || t('deleteFailed'))
            }
        } catch {
            toast.error(t('networkError'))
        } finally {
            setDeleting(null)
            setDeleteTargetId(null)
        }
    }

    if (snapshots.length === 0) {
        return (
            <div className="max-w-[420px] md:max-w-2xl mx-auto w-full pb-20">
                <Hero t={t} />
                <div className="mx-4 border bg-card overflow-hidden">
                    <EmptySnapshotState />
                </div>
            </div>
        )
    }

    const activeSnapshot = snapshots.find(s => s.id === activeId) ?? snapshots[0]
    const activeIndex = snapshots.findIndex(s => s.id === activeSnapshot.id)

    return (
        <div className={cn('max-w-[420px] md:max-w-2xl mx-auto w-full relative', selectedIds.length > 0 ? 'pb-28' : 'pb-4')}>
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
                onSelect={handleActiveSelect}
                language={language}
                t={t}
                selectedIds={selectedIds}
                onToggleSelect={handleSelect}
                onDelete={handleDelete}
                onSimulate={(id) => router.push(`/dashboard/simulation?snapshotId=${id}`)}
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
                <div className="py-4 text-center text-muted-foreground text-xs tracking-wider">
                    — {t('noMoreSnapshots')} —
                </div>
            )}

            {/* FAB — 보유 탭의 종목 추가 FAB과 동일한 사이즈/위치 (48px round, 우하단)
                AI chat이 위쪽 슬롯에 위치하므로 페이지 액션은 항상 아래쪽 슬롯에 둔다. */}
            <Link
                href="/dashboard/snapshots/new"
                aria-label={t('newSnapshot')}
                title={t('newSnapshot')}
                className="fixed right-4 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all duration-150"
                style={{
                    bottom: selectedIds.length > 0
                        ? 'calc(72px + 12px + var(--safe-bottom, 0px))'
                        : 'calc(64px + 12px + var(--safe-bottom, 0px))',
                }}
            >
                <Plus className="w-5 h-5" strokeWidth={2.5} />
            </Link>

            <SnapshotBottomPanel
                currentHoldings={currentHoldings}
                snapshots={snapshots}
                selectedIds={selectedIds}
                onClearSelection={handleClearSelection}
            />

            {/* 스냅샷 삭제 확인 — native confirm() 대체 */}
            <ConfirmDialog
                open={!!deleteTargetId}
                onOpenChange={(next) => { if (!next) setDeleteTargetId(null) }}
                title={language === 'ko' ? '스냅샷 삭제' : 'Delete snapshot'}
                description={t('confirmDelete')}
                confirmLabel={language === 'ko' ? '삭제' : 'Delete'}
                cancelLabel={language === 'ko' ? '취소' : 'Cancel'}
                variant="destructive"
                onConfirm={performDelete}
            />
        </div>
    )
}

/* ─── Hero — 보유 탭과 동일한 헤더 구조 (eyebrow + 32px H1) ─── */
function Hero({ t }: { t: (k: any) => string }) {
    return (
        <section className="px-6 pt-3 pb-4">
            <h1 className="hero-serif text-[32px] text-foreground">
                {t('snapshots')}
            </h1>
            <span className="serif-italic text-xs text-muted-foreground block mt-1">
                {t('snapshotsHeroSubtitle')}
            </span>
        </section>
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
    const labelKey = index === 0
        ? (language === 'ko' ? 'LATEST · 최신' : 'LATEST')
        : (language === 'ko' ? `${index}일 전` : `${index}d ago`)
    const sourceLabel = t('autoSnapshotLabel')

    return (
        <div className="mx-4 mb-4 relative overflow-hidden border bg-card" style={{ padding: 22 }}>
            {/* 3px accent stripe at top */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary" />

            <div className="flex items-center justify-between mb-1">
                <span className="eyebrow">{labelKey}</span>
                <span className="text-[11px] text-muted-foreground">{sourceLabel}</span>
            </div>

            <div className="font-serif text-[22px] text-foreground mt-1.5" suppressHydrationWarning>
                {formatDate(snapshot.snapshotDate, 'yyyy.MM.dd')}
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
    snapshots, activeId, onSelect, language, t, selectedIds, onToggleSelect, onDelete, onSimulate, deletingId,
}: {
    snapshots: Snapshot[]
    activeId: string
    onSelect: (id: string) => void
    language: string
    t: (k: any) => string
    selectedIds: string[]
    onToggleSelect: (id: string, e: React.MouseEvent) => void
    onDelete: (id: string, e: React.MouseEvent) => void
    onSimulate: (id: string) => void
    deletingId: string | null
}) {
    return (
        <>
            <div className="px-6 mb-3">
                <div className="eyebrow">
                    {language === 'ko' ? `TIMELINE · ${t('timeline')}` : 'TIMELINE'}
                </div>
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
                                        {formatDate(s.snapshotDate, 'yyyy.MM.dd')}
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

                                {/* actions row — primary CTA + overflow menu + selection */}
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60 gap-2">
                                    <Link
                                        href={`/dashboard/snapshots/${s.id}`}
                                        onClick={e => e.stopPropagation()}
                                        className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                    >
                                        <Eye className="w-3 h-3" /> {t('details')}
                                    </Link>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={e => onToggleSelect(s.id, e)}
                                            className={cn(
                                                'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border transition-colors',
                                                isSelected
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground',
                                            )}
                                            aria-pressed={isSelected}
                                            aria-label={language === 'ko' ? '비교 선택' : 'Compare select'}
                                        >
                                            {isSelected && (
                                                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                            {language === 'ko' ? '비교' : 'Compare'}
                                        </button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={e => e.stopPropagation()}
                                                    disabled={deleting}
                                                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                                                    aria-label={language === 'ko' ? '더보기' : 'More'}
                                                >
                                                    {deleting
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <MoreVertical className="w-3.5 h-3.5" />}
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="min-w-[140px]" onClick={e => e.stopPropagation()}>
                                                <DropdownMenuItem
                                                    onClick={() => onSimulate(s.id)}
                                                    className="cursor-pointer"
                                                >
                                                    <TrendingUp className="w-4 h-4 mr-2" /> {t('simulation')}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={(e: any) => onDelete(s.id, e)}
                                                    className="cursor-pointer text-destructive focus:text-destructive"
                                                >
                                                    <Trash2 className="w-4 h-4 mr-2" /> {t('delete')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    )
}
