'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { snapshotsApi } from '@/lib/api/client'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { EmptySnapshotState } from '@/components/dashboard/empty-snapshot-state'
import { SnapshotFilterBar, type DateRange } from '@/components/dashboard/snapshots/snapshot-filter-bar'
import { SnapshotTrendChart, type TrendPoint } from '@/components/dashboard/snapshots/snapshot-trend-chart'
import { SelectionTray } from '@/components/dashboard/snapshots/selection-tray'
import { SnapshotCompareSheet } from '@/components/dashboard/snapshots/snapshot-compare-sheet'
import type { SnapshotDetail } from '@/types/snapshot'
import { Loader2, Plus, MoreVertical, Eye, TrendingUp, Trash2, ChevronDown } from 'lucide-react'
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

interface AvailableMonth {
    year: number
    month: number
    count: number
}

interface SnapshotsClientProps {
    initialSnapshots: Snapshot[]
    currentHoldings: any[]
    availableMonths: AvailableMonth[]
}

const MAX_COMPARE = 10
const PAGE_SIZE = 30

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(month: number, language: string) {
    return language === 'ko' ? `${month}월` : EN_MONTHS[month - 1]
}

function getDisplay(snapshot: Snapshot, language: string) {
    // snapshot.totalValue는 주식 평가금만 누적된 값. "총 자산"은 예수금(cashBalance)을 더해야
    // 상세 페이지(snapshot-detail-client.tsx)와 일치한다.
    let displayValue = Number(snapshot.totalValue) + Number(snapshot.cashBalance)
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
                big ? 'text-[0.9375rem]' : 'text-[0.78125rem]',
            )}
        >
            <span aria-hidden>{isUp ? '▲' : '▼'}</span>
            <span>{Math.abs(value).toFixed(2)}%</span>
        </span>
    )
}

export function SnapshotsClient({ initialSnapshots, currentHoldings, availableMonths }: SnapshotsClientProps) {
    const { t, language } = useLanguage()
    const router = useRouter()
    const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [activeId, setActiveId] = useState<string | null>(initialSnapshots[0]?.id ?? null)
    const [range, setRange] = useState<DateRange | null>(null)
    const [isFiltering, setIsFiltering] = useState(false)

    // 선택 항목 상세 캐시 — 기간 필터를 바꾸면 고른 스냅샷이 목록에서 사라지므로,
    // 비교/그래프가 계속 그릴 수 있도록 목록과 분리해 보관한다. (?ids= 로 채운다)
    const [selectedById, setSelectedById] = useState<Record<string, SnapshotDetail>>({})
    const [compareOpen, setCompareOpen] = useState(false)
    const [trendAll, setTrendAll] = useState<TrendPoint[]>([])
    // 초기값 true — fetch 는 클라이언트에서만 도니 SSR·첫 페인트부터 차트 자리를 잡아둔다.
    const [trendLoading, setTrendLoading] = useState(true)

    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
    const [hasMore, setHasMore] = useState(initialSnapshots.length >= 20)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const loadMoreAbortRef = useRef<AbortController | null>(null)
    const selectionAbortRef = useRef<AbortController | null>(null)

    // 필터가 없을 때만 서버 props(initialSnapshots)와 동기화한다.
    // (부모가 router.refresh() 로 재렌더하거나 삭제로 목록이 줄어든 경우 반영, '전체' 복귀 시 복원)
    // 필터가 걸리면 목록은 클라이언트가 소유하므로 props 로 덮어쓰지 않는다.
    useEffect(() => {
        if (range) return
        setSnapshots(initialSnapshots)
        setNextCursor(initialSnapshots.length > 0 ? initialSnapshots[initialSnapshots.length - 1].id : undefined)
        setHasMore(initialSnapshots.length >= 20)
        setActiveId(prev =>
            prev && initialSnapshots.some(s => s.id === prev) ? prev : (initialSnapshots[0]?.id ?? null),
        )
    }, [initialSnapshots, range])

    // Cancel any in-flight pagination fetch when the component unmounts (e.g., tab switch)
    useEffect(() => () => loadMoreAbortRef.current?.abort(), [])

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore || !nextCursor) return

        loadMoreAbortRef.current?.abort()
        const controller = new AbortController()
        loadMoreAbortRef.current = controller

        setIsLoadingMore(true)
        try {
            const response = await snapshotsApi.getList(nextCursor, controller.signal, range ?? undefined, PAGE_SIZE)
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
    }, [nextCursor, hasMore, isLoadingMore, range])

    // 무한스크롤(IntersectionObserver) 제거 — 204개를 거슬러 올라가려면 스크롤로는 답이 없다.
    // 기간 범위로 좁히고 '더 보기'로 이어받는다. cursor 페이징 자체는 그대로 쓴다.

    // 선택된 스냅샷의 상세(holdings 포함)를 목록과 무관하게 확보한다.
    // 목록 props 의 holdings 는 개수 표시용으로 축약돼 있어 종목 비교표에 쓸 수 없고,
    // 기간 필터를 바꾸면 선택 항목이 목록에서 빠지기 때문에 여기서 따로 받아 캐시한다.
    useEffect(() => {
        const missing = selectedIds.filter(id => !selectedById[id])
        if (missing.length === 0) return

        selectionAbortRef.current?.abort()
        const controller = new AbortController()
        selectionAbortRef.current = controller

        snapshotsApi.getByIds(missing, controller.signal)
            .then(res => {
                if (controller.signal.aborted) return
                if (res.success && res.data) {
                    setSelectedById(prev => {
                        const next = { ...prev }
                        for (const snap of res.data ?? []) next[snap.id] = snap
                        return next
                    })
                }
            })
            .catch(err => {
                if ((err as Error).name !== 'AbortError') console.error('Failed to load selected snapshots:', err)
            })
    }, [selectedIds, selectedById])

    useEffect(() => () => selectionAbortRef.current?.abort(), [])

    // 추이 그래프용 전체 시계열 — 요약만 담겨 가볍고 서버가 캐시한다.
    useEffect(() => {
        let alive = true
        fetch('/api/snapshots/chart-data')
            .then(r => r.json())
            .then(j => {
                if (!alive || !j?.success) return
                const rows = j.data as Array<{ id: string; date: string; totalAsset: number; profitRate: number }>
                setTrendAll(rows.map(d => ({
                    id: d.id,
                    date: d.date,
                    totalAsset: Number(d.totalAsset),
                    profitRate: Number(d.profitRate),
                })))
            })
            .catch(() => { /* 그래프는 보조 정보 — 실패해도 목록은 정상 동작 */ })
            // 실패해도 로딩을 내려야 스피너가 영원히 돌지 않는다(차트는 조용히 접힘).
            .finally(() => { if (alive) setTrendLoading(false) })
        return () => { alive = false }
    }, [])

    // 연도 칩 + '전체' 프리셋의 하한. availableMonths 는 snapshotDate desc 순서다.
    const availableYears = useMemo(() => {
        const seen = new Set<number>()
        const out: number[] = []
        for (const m of availableMonths) {
            if (!seen.has(m.year)) { seen.add(m.year); out.push(m.year) }
        }
        return out
    }, [availableMonths])

    const earliestDate = useMemo(() => {
        const last = availableMonths[availableMonths.length - 1]
        return last ? `${last.year}-${String(last.month).padStart(2, '0')}-01` : undefined
    }, [availableMonths])

    const handleActiveSelect = useCallback((id: string) => {
        setActiveId(id)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [])

    /**
     * 기간 범위 적용 — 첫 페이지부터 새로 조회해 목록을 교체한다.
     * **선택은 일부러 유지한다.** 2022년에서 하나 고르고 2025년으로 옮겨 또 고르는 것이
     * 이 기능의 목적이기 때문. 목록에서 사라진 선택 항목은 selectedById 가 들고 있다.
     * null 이면 서버 props(최신 목록)로 복원한다.
     */
    const applyRange = useCallback(async (next: DateRange | null) => {
        loadMoreAbortRef.current?.abort()
        setRange(next)
        if (!next) {
            setIsFiltering(false)
            return
        }
        const controller = new AbortController()
        loadMoreAbortRef.current = controller
        setIsFiltering(true)
        try {
            const response = await snapshotsApi.getList(undefined, controller.signal, next, PAGE_SIZE)
            if (controller.signal.aborted) return
            if (response.success && response.data) {
                setSnapshots(response.data)
                setActiveId(response.data[0]?.id ?? null)
                setNextCursor(response.pagination?.cursor)
                setHasMore(response.pagination?.hasMore ?? false)
                window.scrollTo({ top: 0, behavior: 'smooth' })
            }
        } catch (err) {
            if ((err as Error).name === 'AbortError') return
            console.error('Failed to filter snapshots:', err)
            toast.error(t('networkError'))
        } finally {
            if (!controller.signal.aborted) setIsFiltering(false)
        }
    }, [t])

    const handleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        // toast/side-effect는 setState reducer 안이 아니라 바깥에서 처리한다 — React strict
        // mode에서 reducer가 두 번 호출돼 토스트가 중복 발사되던 문제 해소.
        if (selectedIds.includes(id)) {
            setSelectedIds(prev => prev.filter(p => p !== id))
            return
        }
        if (selectedIds.length >= MAX_COMPARE) {
            toast.info(
                language === 'ko'
                    ? `최대 ${MAX_COMPARE}개까지 비교할 수 있어요`
                    : `You can compare up to ${MAX_COMPARE} snapshots`,
                { id: 'snapshot-compare-limit' },
            )
            return
        }
        setSelectedIds(prev => [...prev, id])
    }
    const handleClearSelection = () => {
        setSelectedIds([])
        setCompareOpen(false)
    }
    const handleRemoveSelected = (id: string) => setSelectedIds(prev => prev.filter(p => p !== id))

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

    // 필터 없는 진짜 빈 상태(스냅샷 0개) — 첫 스냅샷 작성 유도
    if (snapshots.length === 0 && !range) {
        return (
            <div className="max-w-[420px] md:max-w-2xl mx-auto w-full pb-20">
                <Hero t={t} />
                <div className="mx-4 rounded-2xl bg-card overflow-hidden">
                    <EmptySnapshotState />
                </div>
            </div>
        )
    }

    const activeSnapshot = snapshots.find(s => s.id === activeId) ?? snapshots[0] ?? null
    const activeIndex = activeSnapshot ? snapshots.findIndex(s => s.id === activeSnapshot.id) : -1
    // 기간을 좁혔으면 "LATEST/N일 전" 대신 그 범위를 라벨로 표기
    const activeEyebrow = range
        ? `${range.from} ~ ${range.to}`
        : undefined

    // 선택된 스냅샷(날짜 오름차순). 목록 밖 항목은 selectedById 에서 가져온다.
    const selectedSnapshots: SnapshotDetail[] = selectedIds
        .map(id => selectedById[id])
        .filter((s): s is SnapshotDetail => Boolean(s))
        .sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime())

    /**
     * 그래프 대상: 선택이 있으면 그 스냅샷들, 없으면 **기간 필터** 구간.
     *
     * 목록(snapshots)을 기준으로 삼으면 안 된다 — 목록은 30개씩 페이징돼서
     * '전체'를 골라도 최근 한 달만 그려진다. trendAll 은 전체 시계열을 이미 들고 있고
     * 요약만 담겨 가벼우므로 여기서 기간으로 자른다.
     */
    const trendPoints = selectedIds.length > 0
        ? trendAll.filter(p => selectedIds.includes(p.id))
        : range
            ? trendAll.filter(p => {
                const d = p.date.slice(0, 10)
                return d >= range.from && d <= range.to
            })
            : trendAll

    return (
        <div className={cn('max-w-[420px] md:max-w-2xl mx-auto w-full relative', selectedIds.length > 0 ? 'pb-28' : 'pb-4')}>
            <Hero t={t} />
            <SnapshotFilterBar
                range={range}
                onChange={applyRange}
                years={availableYears}
                earliest={earliestDate}
                disabled={isFiltering}
                language={language}
            />

            {/* 조건부 렌더를 없애고 loading 을 넘긴다 — 차트가 "없다가 갑자기 생기며" 목록을
                밀어내던 문제. 자리는 컴포넌트가 잡고, 비어 있을 때 접는 판단도 컴포넌트가 한다.
                snapshots.length 조건: 스냅샷이 아예 없는 새 계정에서 스피너만 돌다 사라지는 걸 막는다. */}
            <SnapshotTrendChart
                points={trendPoints}
                loading={trendLoading && snapshots.length > 0}
                isSelection={selectedIds.length > 0}
                language={language}
            />

            <SelectionTray
                selected={selectedSnapshots}
                max={MAX_COMPARE}
                onRemove={handleRemoveSelected}
                onClear={handleClearSelection}
                onCompare={() => setCompareOpen(true)}
                language={language}
            />

            {snapshots.length === 0 ? (
                <PeriodEmpty t={t} />
            ) : (
                <>
                    {activeSnapshot && (
                        <ActiveSnapshotCard
                            snapshot={activeSnapshot}
                            index={activeIndex}
                            eyebrowOverride={activeEyebrow}
                            language={language}
                            t={t}
                            onSimulate={(id) => router.push(`/dashboard/simulation?snapshotId=${id}`)}
                        />
                    )}
                    <TimelineSection
                        snapshots={snapshots}
                        activeId={activeSnapshot?.id ?? ''}
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
                        <div className="px-4 py-5">
                            <button
                                type="button"
                                onClick={loadMore}
                                disabled={isLoadingMore}
                                className="w-full rounded-xl bg-card py-3 text-[0.8125rem] font-bold text-foreground hover:bg-accent-soft transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                            >
                                {isLoadingMore
                                    ? <><Loader2 className="h-4 w-4 animate-spin" />{t('loadingMore')}</>
                                    : (language === 'ko' ? '더 보기' : 'Load more')}
                            </button>
                        </div>
                    )}
                    {!hasMore && snapshots.length > 0 && (
                        <div className="py-4 text-center text-muted-foreground text-xs tracking-wider">
                            — {t('noMoreSnapshots')} —
                        </div>
                    )}
                </>
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

            <SnapshotCompareSheet
                open={compareOpen}
                snapshots={selectedSnapshots}
                currentHoldings={currentHoldings}
                onClose={() => setCompareOpen(false)}
                language={language}
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
            <h1 className="hero-serif text-[2rem] text-foreground">
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
    snapshot, index, eyebrowOverride, language, t, onSimulate,
}: {
    snapshot: Snapshot
    index: number
    eyebrowOverride?: string
    language: string
    t: (k: any) => string
    onSimulate: (id: string) => void
}) {
    const { displayValue, displayProfit, currency } = getDisplay(snapshot, language)
    const profitRate = Number(snapshot.profitRate)
    const isProfit = displayProfit >= 0
    const holdingsCount = snapshot.holdings.length
    const labelKey = eyebrowOverride ?? (index === 0
        ? (language === 'ko' ? '최신' : 'Latest')
        : (language === 'ko' ? `${index}일 전` : `${index}d ago`))
    const sourceLabel = t('autoSnapshotLabel')

    return (
        <div className="mx-4 mb-4 relative overflow-hidden rounded-2xl bg-card" style={{ padding: 22 }}>

            <div className="flex items-center justify-between mb-1">
                <span className="eyebrow">{labelKey}</span>
                <span className="text-[0.6875rem] text-muted-foreground">{sourceLabel}</span>
            </div>

            <div className="text-[1.375rem] font-bold tracking-tight text-foreground mt-1.5 numeric" suppressHydrationWarning>
                {formatDate(snapshot.snapshotDate, 'yyyy.MM.dd')}
            </div>
            <div className="text-[0.6875rem] text-muted-foreground mb-[18px]">
                <span suppressHydrationWarning>{formatDate(snapshot.snapshotDate, 'HH:mm')}</span>
                {' · '}
                {holdingsCount}{t('countUnit')} {t('stock')}
            </div>

            <div className="text-[0.6875rem] font-semibold text-muted-foreground mb-1">
                {t('totalValue')}
            </div>
            <div className="amount-display text-[1.875rem] text-foreground leading-none">
                {formatCurrency(displayValue, currency)}
            </div>

            <div className="flex gap-4 mt-3.5 items-stretch">
                <div>
                    <div className="text-[0.75rem] font-medium text-muted-foreground">
                        {t('returnRate')}
                    </div>
                    <div className="mt-1"><UpDown value={profitRate} big /></div>
                </div>
                <div className="w-px bg-border self-stretch" />
                <div>
                    <div className="text-[0.75rem] font-medium text-muted-foreground">
                        {t('pl')}
                    </div>
                    <div className={cn('text-[0.9375rem] font-bold mt-1 numeric', isProfit ? 'text-profit' : 'text-loss')}>
                        {isProfit ? '+' : ''}{formatCurrency(displayProfit, currency)}
                    </div>
                </div>
            </div>

            {/* 컴팩트 액션 라인 — 상세보기(텍스트 링크) + ⋮(시뮬레이션). 타임라인/상세 패턴과 일치 */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
                <Link
                    href={`/dashboard/snapshots/${snapshot.id}`}
                    className="text-[0.75rem] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                    <Eye className="w-3.5 h-3.5" /> {t('details')}
                </Link>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="p-1.5 -mr-1.5 text-muted-foreground hover:text-foreground"
                            aria-label={language === 'ko' ? '더보기' : 'More'}
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[140px]">
                        <DropdownMenuItem
                            onClick={() => onSimulate(snapshot.id)}
                            className="cursor-pointer"
                        >
                            <TrendingUp className="w-4 h-4 mr-2" /> {t('simulation')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}

/* ─── Filter bar (연/월 선택) ─── */
/* ─── 선택한 기간에 스냅샷이 없을 때 ─── */
function PeriodEmpty({ t }: { t: (k: any) => string }) {
    return (
        <div className="mx-4 my-6 p-8 bg-card rounded-2xl text-center">
            <p className="text-[0.8125rem] text-muted-foreground">{t('noSnapshotsInPeriod')}</p>
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
                    {language === 'ko' ? t('timeline') : 'Timeline'}
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
                            className={cn(
                                'flex items-start gap-4 py-3 transition-opacity',
                                isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100',
                            )}
                        >
                            {/* dot — 상단 요약 카드에 띄울 시점을 고르는 유일한 컨트롤.
                                탭 영역을 44px 로 넓히되(모바일에서 안 눌리면 기능이 없는 것과 같다)
                                음수 마진 대신 의사요소를 쓴다 — -m-* 는 mt-1 과 같은 margin 속성이라
                                충돌해 세로 정렬이 어긋난다. before 는 레이아웃에 영향을 주지 않는다. */}
                            <button
                                type="button"
                                onClick={() => onSelect(s.id)}
                                aria-pressed={isActive}
                                aria-label={language === 'ko' ? '이 시점 요약 보기' : 'Show this snapshot summary'}
                                className="flex-shrink-0 mt-1 relative z-10 cursor-pointer before:absolute before:-inset-[0.6875rem] before:content-['']"
                            >
                                <span
                                    className={cn(
                                        'w-[1.375rem] h-[1.375rem] rounded-full',
                                        'flex items-center justify-center border-2 transition-colors',
                                        isActive
                                            ? 'bg-primary border-primary'
                                            : 'bg-card border-border hover:border-primary',
                                    )}
                                >
                                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </span>
                            </button>

                            {/* card */}
                            <div
                                className={cn(
                                    'flex-1 min-w-0 rounded-2xl bg-card p-3.5',
                                    isSelected && 'ring-1 ring-primary border-primary',
                                )}
                            >
                                {/* 정보 영역만 Link 로 감싼다 — 액션 행을 밖에 두어 링크 중첩을 피하고,
                                    앞으로 추가될 버튼이 stopPropagation 을 빠뜨려도 상세로 튀지 않게 한다. */}
                                <Link href={`/dashboard/snapshots/${s.id}`} className="block -mx-3.5 -mt-3.5 px-3.5 pt-3.5">
                                    <div className="flex justify-between items-baseline">
                                        <span className="font-serif text-sm font-semibold text-foreground" suppressHydrationWarning>
                                            {formatDate(s.snapshotDate, 'yyyy.MM.dd')}
                                        </span>
                                        <UpDown value={profitRate} />
                                    </div>
                                    <div className="flex justify-between items-baseline mt-1 gap-2">
                                        <span className="text-[0.6875rem] text-muted-foreground">
                                            <span suppressHydrationWarning>{formatDate(s.snapshotDate, 'HH:mm')}</span>
                                            {' · '}
                                            {holdingsCount}{t('stock')}
                                        </span>
                                        <span className="text-[0.8125rem] font-bold text-foreground numeric">
                                            {formatCurrency(displayValue, currency)}
                                        </span>
                                    </div>
                                </Link>

                                {/* actions row — primary CTA + overflow menu + selection */}
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60 gap-2">
                                    <Link
                                        href={`/dashboard/snapshots/${s.id}`}
                                        onClick={e => e.stopPropagation()}
                                        className="text-[0.6875rem] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                    >
                                        <Eye className="w-3 h-3" /> {t('details')}
                                    </Link>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={e => onToggleSelect(s.id, e)}
                                            className={cn(
                                                'inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.6875rem] font-medium rounded-md transition-colors',
                                                isSelected
                                                    ? 'bg-accent-soft text-primary font-bold'
                                                    : 'bg-secondary text-muted-foreground hover:text-foreground',
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
