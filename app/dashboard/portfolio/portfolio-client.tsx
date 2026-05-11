'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TransferHoldingDialog } from '@/components/dashboard/transfer-holding-dialog'
import { useRelativeTime } from '@/lib/hooks/use-relative-time'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { holdingsApi } from '@/lib/api/client'
import { formatCurrency, formatNumber, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { DonutChart } from '@/components/dashboard/donut-chart'
import { CashBalanceDialog } from '@/components/dashboard/cash-balance-dialog'
import { PortfolioShareButton } from '@/components/dashboard/portfolio-share'
import { BulkImportDialog } from '@/components/dashboard/bulk-import-dialog'
import { ExchangeRateFootnote } from '@/components/dashboard/exchange-rate-footnote'
import { AccountSelector, type BrokerageAccountOption } from '@/components/dashboard/account-selector'
import { Plus, Edit2, Trash2, Check, X, Loader2, ArrowUp, ArrowDown, MoreVertical, Wallet, Upload, ArrowLeftRight } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const RECENT_ACCOUNT_STORAGE_KEY = 'holdings:recent-account'
const VIEW_MODE_STORAGE_KEY = 'holdings-view-mode'
const ACCOUNT_FILTER_STORAGE_KEY = 'holdings-account-filter'

const SEGMENT_COLORS = [
    '#3b82f6', '#a855f7', '#10b981', '#ef4444', '#f59e0b',
    '#ec4899', '#06b6d4', '#8b5cf6', '#14b8a6', '#f97316',
    '#6366f1', '#84cc16',
]

interface Holding {
    id: string
    stockId: string
    stockCode: string
    stockName: string
    market: string
    quantity: number
    averagePrice: number
    currentPrice: number
    currency: string
    purchaseRate: number
    totalCost: number
    currentValue: number
    profit: number
    profitRate: number
    /** Phase B 다중 계좌 — Agent 4 가 응답에 추가. 단일 계좌/Phase A 미적용 환경에선 null. */
    accountId?: string | null
    accountName?: string | null
    /** 현재가가 마지막으로 갱신된 시점 (ISO). 사용자에게 캐시 시점 안내용. */
    priceUpdatedAt?: string | null
}

type ViewMode = 'byAccount' | 'unified'

interface Summary {
    totalCost: number
    totalValue: number
    totalProfit: number
    totalProfitRate: number
    holdingsCount: number
    exchangeRate: number
    exchangeRateUpdatedAt?: string | null
    cashBalance: number
}

type SortKey = 'currentValue' | 'totalCost' | 'profit'
type SortDir = 'desc' | 'asc'

interface Props {
    initialHoldings: Holding[]
    summary: Summary
    userName?: string | null
    accounts?: BrokerageAccountOption[]
}

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

export function PortfolioClient({ initialHoldings, summary, userName, accounts = [] }: Props) {
    const { t, language } = useLanguage()
    const { baseCurrency } = useCurrency()
    const [holdings, setHoldings] = useState<Holding[]>(initialHoldings)
    const [currentSummary, setCurrentSummary] = useState<Summary>(summary)
    const isMultiAccount = accounts.length > 1

    // 보기 모드: byAccount(계좌별 섹션) ↔ unified(통합 합산)
    // 단일 계좌일 때 토글 자체를 숨기고 모드는 무관 (UI 영향 없음).
    const [viewMode, setViewMode] = useState<ViewMode>('byAccount')
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
            if (stored === 'byAccount' || stored === 'unified') {
                setViewMode(stored)
            }
        } catch { /* ignore */ }
    }, [])
    const handleViewModeChange = (next: ViewMode) => {
        setViewMode(next)
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next)
            } catch { /* ignore */ }
        }
    }

    // 계좌 탭 필터 — 계좌별 모드에서 특정 계좌만 보기. 'all' = 전체 계좌 표시.
    // accountId 가 삭제된 계좌면 'all' 로 자동 폴백.
    const [accountFilter, setAccountFilter] = useState<string | 'all'>('all')
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const stored = window.localStorage.getItem(ACCOUNT_FILTER_STORAGE_KEY)
            if (stored) setAccountFilter(stored)
        } catch { /* ignore */ }
    }, [])
    // 저장된 accountId 가 현재 accounts 목록에 없으면 'all' 로 폴백
    useEffect(() => {
        if (accountFilter === 'all') return
        const exists = accounts.some(a => a.id === accountFilter)
        if (!exists) setAccountFilter('all')
    }, [accountFilter, accounts])
    const handleAccountFilterChange = (next: string | 'all') => {
        setAccountFilter(next)
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(ACCOUNT_FILTER_STORAGE_KEY, next)
            } catch { /* ignore */ }
        }
    }

    // 부모 server component 가 router.refresh() 로 새 props 를 내려보내면
    // useState 의 초기값은 마운트 시점에만 적용되므로 자동 갱신 안 됨.
    // 명시적으로 props 변경을 감지해 state 를 동기화한다.
    // (예: 예수금/목표금액/스냅샷 변이 후 home 또는 portfolio 가 fresh 데이터로
    //  rerender 되었을 때 화면이 즉시 반영되어야 함.)
    useEffect(() => {
        setHoldings(initialHoldings)
    }, [initialHoldings])
    useEffect(() => {
        setCurrentSummary(summary)
    }, [summary])
    const [sortKey, setSortKey] = useState<SortKey>('profit')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [selectedSegIdx, setSelectedSegIdx] = useState<number | null>(null)

    // Add form (FAB + bottom drawer)
    const [newStock, setNewStock] = useState<any>(null)
    const [newQty, setNewQty] = useState('')
    const [newPrice, setNewPrice] = useState('')
    const [newPurchaseRate, setNewPurchaseRate] = useState('')
    const [newAccountId, setNewAccountId] = useState<string | null>(null)
    const [addMode, setAddMode] = useState<'merge' | 'overwrite'>('merge')
    const [adding, setAdding] = useState(false)
    const [showAdd, setShowAdd] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const handleDrawerChange = (next: boolean) => {
        if (!next) {
            setNewStock(null)
            setNewQty('')
            setNewPrice('')
            setNewPurchaseRate('')
            setAddMode('merge')
            // newAccountId 는 의도적으로 유지 — 드로어 재오픈 시 마지막 선택 계좌가 자연스럽게 남는다.
        }
        setShowAdd(next)
    }

    const handleStockSelect = (s: any) => {
        setNewStock(s)
        setAddMode('merge')
        // USD 종목이면 매입환율을 현재 환율로 자동 채움 — 사용자가 실제 매입 시점 환율로 수정 가능
        const isUsd = s?.market && s.market !== 'KOSPI' && s.market !== 'KOSDAQ'
        setNewPurchaseRate(isUsd && exRate ? exRate.toFixed(2) : '')
    }

    // 같은 계좌 + 같은 종목으로 이미 보유 중인 row 가 있는지 — 물타기/덮어쓰기 분기 기준.
    // 다중 계좌에서는 다른 계좌에 같은 종목이 있어도 별개로 취급.
    const existingHolding = useMemo(() => {
        if (!newStock) return null
        if (isMultiAccount) {
            if (!newAccountId) return null
            return holdings.find(h => h.stockId === newStock.id && h.accountId === newAccountId) ?? null
        }
        // 단일 계좌(또는 Phase A 미적용) — 기존 동작 유지: stockId 만으로 매칭
        return holdings.find(h => h.stockId === newStock.id) ?? null
    }, [newStock, holdings, isMultiAccount, newAccountId])

    // Edit/delete
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValues, setEditValues] = useState({ quantity: '', averagePrice: '', purchaseRate: '' })
    const [savingRow, setSavingRow] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const exRate = currentSummary.exchangeRate || FALLBACK_USD_RATE
    // USD 종목 한 개라도 보유 시에만 환율 footnote 의미 있음
    const hasUsdHolding = useMemo(() => holdings.some(h => h.currency === 'USD'), [holdings])

    // baseCurrency 기준 수익률 계산 — KRW면 환차손익 포함, USD면 달러 단순 등락
    const calcDisplayProfitRate = (h: Holding) => {
        const effRate = h.currency === 'USD'
            ? (h.purchaseRate && h.purchaseRate !== 1 ? h.purchaseRate : exRate)
            : 1
        const cost = baseCurrency === 'KRW'
            ? (h.currency === 'USD' ? h.totalCost * effRate : h.totalCost)
            : (h.currency === 'USD' ? h.totalCost : h.totalCost / exRate)
        const value = baseCurrency === 'KRW'
            ? (h.currency === 'USD' ? h.currentValue * exRate : h.currentValue)
            : (h.currency === 'USD' ? h.currentValue : h.currentValue / exRate)
        return cost > 0 ? ((value - cost) / cost) * 100 : 0
    }

    const router = useRouter()
    const refresh = useCallback(async () => {
        const res = await holdingsApi.getList()
        if (res.success && res.data) {
            setHoldings(res.data.holdings)
            setCurrentSummary(res.data.summary)
            setSelectedSegIdx(null)
        }
        // RSC payload cache 무효화 — F5 시 stale segment 가 재사용되어 추가/수정/삭제
        // 결과가 보이지 않는 문제를 막는다. server action 이 아닌 REST API mutation 이라
        // 자동 revalidate 가 일어나지 않아 명시적으로 호출.
        router.refresh()
    }, [router])

    // AI 챗 등 외부 컴포넌트에서 발행한 'portfolio:refresh' 이벤트를 받으면 보유 목록을 다시 가져온다.
    useEffect(() => {
        const handler = () => { refresh() }
        window.addEventListener('portfolio:refresh', handler)
        return () => window.removeEventListener('portfolio:refresh', handler)
    }, [refresh])

    // 통합 모드 — 같은 stockId 의 여러 계좌 row 를 합쳐 가중평균 평단으로 표시.
    // Decimal.js 사용 — 누적 부동소수점 오차 방지 (평단가는 한 번 어긋나면 영구 오류).
    const unifiedHoldings = useMemo<Holding[]>(() => {
        const groups = new Map<string, Holding[]>()
        for (const h of holdings) {
            const list = groups.get(h.stockId) ?? []
            list.push(h)
            groups.set(h.stockId, list)
        }
        const merged: Holding[] = []
        for (const [stockId, list] of groups) {
            if (list.length === 1) {
                merged.push(list[0])
                continue
            }
            // 같은 stockId 의 여러 row 합산. currency/market 은 첫 항목 기준 (동일 종목이므로 동일).
            const first = list[0]
            let totalQty = new Decimal(0)
            let totalCostByCurrency = new Decimal(0)
            // 가중평균 매입환율 = sum(qty * purchaseRate) / sum(qty) — USD 종목에 한해 의미
            let weightedRateNumer = new Decimal(0)
            let totalCurrentValue = new Decimal(0)
            for (const h of list) {
                const qty = new Decimal(h.quantity)
                const avg = new Decimal(h.averagePrice)
                totalQty = totalQty.plus(qty)
                totalCostByCurrency = totalCostByCurrency.plus(avg.times(qty))
                totalCurrentValue = totalCurrentValue.plus(new Decimal(h.currentValue))
                if (h.purchaseRate && h.purchaseRate !== 1) {
                    weightedRateNumer = weightedRateNumer.plus(new Decimal(h.purchaseRate).times(qty))
                }
            }
            const avgPrice = totalQty.gt(0) ? totalCostByCurrency.div(totalQty) : new Decimal(0)
            const purchaseRate = first.currency === 'USD' && totalQty.gt(0) && weightedRateNumer.gt(0)
                ? weightedRateNumer.div(totalQty).toNumber()
                : first.purchaseRate
            const totalCost = totalCostByCurrency.toNumber()
            const currentValue = totalCurrentValue.toNumber()
            const profit = currentValue - totalCost
            const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0
            merged.push({
                // unified-{stockId} 를 가상 ID 로 — 실제 row id 가 아님 (편집/삭제 불가하다는 신호)
                id: `unified-${stockId}`,
                stockId,
                stockCode: first.stockCode,
                stockName: first.stockName,
                market: first.market,
                quantity: totalQty.toNumber(),
                averagePrice: avgPrice.toNumber(),
                currentPrice: first.currentPrice,
                currency: first.currency,
                purchaseRate,
                totalCost,
                currentValue,
                profit,
                profitRate,
                accountId: null,
                accountName: null,
            })
        }
        return merged
    }, [holdings])

    // 화면에 그릴 holdings — 모드에 따라 통합 vs 원본
    const baseHoldings = useMemo(() => {
        if (!isMultiAccount) return holdings
        return viewMode === 'unified' ? unifiedHoldings : holdings
    }, [holdings, unifiedHoldings, viewMode, isMultiAccount])

    const sortedHoldings = useMemo(() => {
        const arr = [...baseHoldings]
        arr.sort((a, b) => {
            const norm = (h: Holding, key: SortKey) =>
                h.currency === 'USD' ? h[key] * exRate : h[key]
            const diff = norm(a, sortKey) - norm(b, sortKey)
            return sortDir === 'desc' ? -diff : diff
        })
        return arr
    }, [baseHoldings, sortKey, sortDir, exRate])

    const totalValueNormalized = currentSummary.totalValue || 1

    const holdingsWithWeight = useMemo(() =>
        sortedHoldings.map((h, idx) => {
            const valNorm = h.currency === 'USD' ? h.currentValue * exRate : h.currentValue
            const weight = (valNorm / totalValueNormalized) * 100
            return { ...h, weight, color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length] }
        }),
        [sortedHoldings, totalValueNormalized, exRate]
    )

    // Build donut from current view's holdings (preserves color stability across sort changes).
    // 통합 모드면 종목별 합산 row 기준, 계좌별 모드면 계좌×종목 단위 row 기준.
    const donutSegments = useMemo(() => {
        const sortedByValue = [...baseHoldings].sort((a, b) => {
            const norm = (h: Holding) => h.currency === 'USD' ? h.currentValue * exRate : h.currentValue
            return norm(b) - norm(a)
        })
        return sortedByValue.map((h, i) => ({
            value: h.currency === 'USD' ? h.currentValue * exRate : h.currentValue,
            color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
            holding: h,
        }))
    }, [baseHoldings, exRate])

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const handleAdd = async () => {
        if (!newStock || !newQty || !newPrice) return
        // 다중 계좌면 accountId 필수
        if (isMultiAccount && !newAccountId) {
            toast.error(language === 'ko' ? '계좌를 선택해주세요.' : 'Please select an account.')
            return
        }
        setAdding(true)
        const purchaseRateVal = newPurchaseRate ? parseFloat(newPurchaseRate.replace(/,/g, '')) : 0
        try {
            const res = await holdingsApi.create({
                stockId: newStock.id,
                quantity: parseInt(newQty.replace(/,/g, '')),
                averagePrice: parseFloat(newPrice.replace(/,/g, '')),
                mode: existingHolding ? addMode : 'overwrite',
                ...(newAccountId ? { accountId: newAccountId } : {}),
                ...(purchaseRateVal > 0 ? { purchaseRate: purchaseRateVal } : {}),
            })
            if (res.success) {
                setNewStock(null)
                setNewQty('')
                setNewPrice('')
                setNewPurchaseRate('')
                setShowAdd(false)
                await refresh()
            } else {
                toast.error(res.error?.message || t('addStockFailed'))
            }
        } catch {
            toast.error(t('networkError'))
        } finally {
            setAdding(false)
        }
    }

    const startEdit = (h: Holding) => {
        // 통합 모드의 가상 합산 row 는 편집 불가 (실제 DB row 가 아님)
        if (h.id.startsWith('unified-')) return
        setEditingId(h.id)
        setEditValues({
            quantity: h.quantity.toString(),
            averagePrice: h.averagePrice.toString(),
            purchaseRate: h.purchaseRate ? h.purchaseRate.toString() : '',
        })
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditValues({ quantity: '', averagePrice: '', purchaseRate: '' })
    }

    const saveEdit = async (id: string, currency: string) => {
        if (savingRow) return
        setSavingRow(id)
        const purchaseRateVal = editValues.purchaseRate ? parseFloat(editValues.purchaseRate.replace(/,/g, '')) : undefined
        try {
            const res = await holdingsApi.update(id, {
                quantity: parseInt(editValues.quantity),
                averagePrice: parseFloat(editValues.averagePrice),
                ...(currency === 'USD' && purchaseRateVal && purchaseRateVal > 0 && { purchaseRate: purchaseRateVal }),
            })
            if (res.success) {
                setEditingId(null)
                await refresh()
            } else {
                toast.error(res.error?.message || t('genericUpdateFailed'))
            }
        } catch {
            toast.error(t('networkError'))
        } finally {
            setSavingRow(null)
        }
    }

    // 종목 삭제 — native confirm() 대신 ConfirmDialog 사용.
    // 1) 삭제 아이콘 클릭 → setDeleteTargetId 로 다이얼로그 열기만
    // 2) ConfirmDialog 의 onConfirm 에서 실제 삭제 수행
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
    const deleteTargetHolding = useMemo(
        () => (deleteTargetId ? holdings.find(h => h.id === deleteTargetId) ?? null : null),
        [deleteTargetId, holdings]
    )

    // 이체 다이얼로그 — 종목 카드 ⋮ → "다른 계좌로 이체"
    const [transferTargetId, setTransferTargetId] = useState<string | null>(null)
    const transferTargetHolding = useMemo(
        () => (transferTargetId ? holdings.find(h => h.id === transferTargetId) ?? null : null),
        [transferTargetId, holdings]
    )

    const handleDelete = (id: string) => {
        setDeleteTargetId(id)
    }

    const performDelete = useCallback(async () => {
        if (!deleteTargetId) return
        setDeletingId(deleteTargetId)
        try {
            const res = await holdingsApi.delete(deleteTargetId)
            if (res.success) await refresh()
            else toast.error(res.error?.message || t('deleteFailed'))
        } catch {
            toast.error(t('networkError'))
        } finally {
            setDeletingId(null)
            setDeleteTargetId(null)
        }
    }, [deleteTargetId, refresh, t])

    const convert = (v: number) => baseCurrency === 'KRW' ? v : v / exRate
    const displayTotal = convert(currentSummary.totalValue)

    // 카드 렌더 함수 — byAccount 모드에서 그룹별로 호출, unified/단일계좌에서 평탄 리스트로 호출.
    // 헤더에 단순 값/평단 등 표시 정보는 holdingsWithWeight 가 미리 계산해 둠 (weight/color 포함).
    type HoldingCardItem = (typeof holdingsWithWeight)[number]
    const renderHoldingCard = (h: HoldingCardItem) => {
        const isEditing = editingId === h.id
        const isVirtual = h.id.startsWith('unified-')
        // 평가금: 현재 환율로 변환
        const toBase = (v: number) => baseCurrency === 'KRW'
            ? (h.currency === 'USD' ? v * exRate : v)
            : (h.currency === 'USD' ? v : v / exRate)
        const valueDisplay = toBase(h.currentValue)
        // 매입금: purchaseRate(매입 시점 환율)로 고정 — 현재 환율 변동 영향 없음
        const effectivePurchaseRate = h.currency === 'USD'
            ? (h.purchaseRate && h.purchaseRate !== 1 ? h.purchaseRate : exRate)
            : 1
        const costDisplay = baseCurrency === 'KRW'
            ? (h.currency === 'USD' ? h.totalCost * effectivePurchaseRate : h.totalCost)
            : (h.currency === 'USD' ? h.totalCost : h.totalCost / exRate)
        // 수익금: 평가금 - 매입금 (통화 기준 일치)
        const profitDisplay = valueDisplay - costDisplay
        const displayProfitRate = costDisplay > 0 ? (profitDisplay / costDisplay) * 100 : 0
        const profitText = profitDisplay >= 0
            ? `+${formatCurrency(profitDisplay, baseCurrency)}`
            : formatCurrency(profitDisplay, baseCurrency)

        return (
            <div
                key={h.id}
                className={cn(
                    'bg-card border border-border p-4',
                    isEditing && 'border-primary',
                )}
                style={{ borderLeftWidth: '3px', borderLeftColor: h.color }}
            >
                {/* Row 1: 종목명 (full) + overflow menu */}
                <div className="flex items-start justify-between gap-2">
                    <div className="font-serif text-[15px] font-semibold text-foreground leading-snug break-keep flex-1 min-w-0">
                        {h.stockName}
                    </div>
                    {!isEditing && !isVirtual && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    disabled={!!editingId || deletingId === h.id}
                                    className="-mt-1 -mr-2 p-2 text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0"
                                    aria-label={language === 'ko' ? '더보기' : 'More'}
                                >
                                    {deletingId === h.id
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <MoreVertical className="w-4 h-4" />}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[140px]">
                                <DropdownMenuItem
                                    onClick={() => startEdit(h)}
                                    className="cursor-pointer"
                                >
                                    <Edit2 className="w-4 h-4 mr-2" /> {t('edit')}
                                </DropdownMenuItem>
                                {accounts.length >= 2 && (
                                    <DropdownMenuItem
                                        onClick={() => setTransferTargetId(h.id)}
                                        className="cursor-pointer"
                                    >
                                        <ArrowLeftRight className="w-4 h-4 mr-2" />
                                        {language === 'ko' ? '다른 계좌로 이체' : 'Transfer to account'}
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    onClick={() => handleDelete(h.id)}
                                    className="cursor-pointer text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" /> {t('delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>

                {/* Row 2: 메타 (좌) + 평가금액·등락률 (우) */}
                <div className="mt-1.5 flex items-end justify-between gap-3">
                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] flex-1 min-w-0 space-y-0.5">
                        <div>
                            {h.stockCode} · {formatNumber(h.quantity)}{language === 'ko' ? '주' : 'shr'}
                            {' · '}
                            {language === 'ko' ? '평단 ' : 'avg '}
                            {formatCurrency(h.averagePrice, h.currency)}
                        </div>
                        <div>
                            {language === 'ko' ? `비중 ${h.weight.toFixed(1)}%` : `${h.weight.toFixed(1)}% wt`}
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-[10px] text-muted-foreground tracking-[0.5px] numeric">
                            {language === 'ko' ? '매입' : 'Cost'} {formatCurrency(costDisplay, baseCurrency)}
                        </div>
                        <div className="text-[14px] font-bold text-foreground numeric mt-0.5">
                            {formatCurrency(valueDisplay, baseCurrency)}
                        </div>
                        <div className="mt-0.5 flex items-center justify-end gap-1.5">
                            <UpDown value={displayProfitRate} />
                            <span className={cn(
                                'text-[11px] font-semibold numeric',
                                h.profit >= 0 ? 'text-profit' : 'text-loss',
                            )}>
                                {profitText}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Edit row */}
                {isEditing ? (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                        <div className={cn('grid gap-2', h.currency === 'USD' ? 'grid-cols-3' : 'grid-cols-2')}>
                            <FormattedNumberInput
                                label={t('quantity')}
                                suffix={language === 'ko' ? '주' : 'shr'}
                                value={editValues.quantity}
                                onChange={v => setEditValues(p => ({ ...p, quantity: v }))}
                                disabled={savingRow !== null}
                            />
                            <FormattedNumberInput
                                label={t('averagePrice')}
                                prefix="$"
                                value={editValues.averagePrice}
                                onChange={v => setEditValues(p => ({ ...p, averagePrice: v }))}
                                disabled={savingRow !== null}
                            />
                            {h.currency === 'USD' && (
                                <FormattedNumberInput
                                    label={language === 'ko' ? '매입환율' : 'Buy rate'}
                                    prefix="₩"
                                    value={editValues.purchaseRate}
                                    onChange={v => setEditValues(p => ({ ...p, purchaseRate: v }))}
                                    disabled={savingRow !== null}
                                />
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingRow !== null}
                                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1"
                            >
                                <X className="w-3 h-3" /> {t('cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => saveEdit(h.id, h.currency)}
                                disabled={savingRow !== null}
                                className="bg-primary text-primary-foreground px-3 py-1 text-xs font-bold inline-flex items-center gap-1 hover:opacity-90"
                            >
                                {savingRow === h.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                {t('save')}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        )
    }

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full">
            {/* Hero — page title + page-level actions (일괄 등록 + 공유) */}
            <section className="px-6 pt-3 pb-4 flex items-end justify-between gap-3">
                <h1 className="hero-serif text-[32px] text-foreground leading-tight">
                    {language === 'ko' ? '현재 보유 자산' : 'Current Holdings'}
                </h1>
                <div className="flex items-center gap-1">
                    <BulkImportDialog onSuccess={refresh}>
                        <button
                            type="button"
                            className="text-[11px] font-bold tracking-wide text-muted-foreground hover:text-foreground px-2.5 py-2 inline-flex items-center gap-1 min-h-[36px]"
                            aria-label={language === 'ko' ? '일괄 등록' : 'Bulk import'}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">
                                {language === 'ko' ? '일괄 등록' : 'Bulk'}
                            </span>
                        </button>
                    </BulkImportDialog>
                    <PortfolioShareButton
                        holdings={holdings}
                        summary={{
                            totalCost: currentSummary.totalCost,
                            totalValue: currentSummary.totalValue,
                            cashBalance: currentSummary.cashBalance,
                            exchangeRate: exRate,
                        }}
                        userName={userName}
                    />
                </div>
            </section>

            {/* Donut + legend */}
            {holdings.length > 0 && (() => {
                const selectedSeg = selectedSegIdx !== null ? donutSegments[selectedSegIdx] : null
                const selectedHolding = selectedSeg?.holding ?? null
                const selectedWeight = selectedSeg
                    ? (selectedSeg.value / (currentSummary.totalValue || 1)) * 100
                    : 0
                const selectedValueDisplay = selectedHolding
                    ? (baseCurrency === 'KRW'
                        ? (selectedHolding.currency === 'USD' ? selectedHolding.currentValue * exRate : selectedHolding.currentValue)
                        : (selectedHolding.currency === 'USD' ? selectedHolding.currentValue : selectedHolding.currentValue / exRate))
                    : 0

                return (
                    <section
                        className="mx-4 mb-4 p-5 bg-card border border-border"
                        onClick={(e) => {
                            // 카드 빈 영역 탭 시 선택 해제 (레전드/도넛 path 클릭은 stopPropagation 처리)
                            if (e.target === e.currentTarget) setSelectedSegIdx(null)
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div className="shrink-0">
                                <DonutChart
                                    data={donutSegments}
                                    size={130}
                                    thickness={18}
                                    selectedIndex={selectedSegIdx}
                                    onSegmentSelect={setSelectedSegIdx}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                {selectedHolding ? (
                                    <>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span
                                                className="w-2 h-2 rounded-sm shrink-0"
                                                style={{ background: selectedSeg!.color }}
                                            />
                                            <span className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase truncate">
                                                {selectedHolding.stockCode}
                                            </span>
                                        </div>
                                        <div className="font-serif text-[18px] font-semibold text-foreground numeric leading-tight">
                                            {formatCurrency(selectedValueDisplay, baseCurrency)}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                            <span className="numeric font-semibold text-foreground">
                                                {selectedWeight.toFixed(1)}%
                                            </span>
                                            <span>·</span>
                                            <UpDown value={calcDisplayProfitRate(selectedHolding)} />
                                        </div>
                                        <div className="mt-1 text-[11px] text-muted-foreground truncate">
                                            {selectedHolding.stockName}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                                            {t('totalValue')}
                                        </div>
                                        <div className="font-serif text-[20px] font-semibold text-foreground numeric leading-tight mt-0.5">
                                            {formatCurrency(displayTotal, baseCurrency)}
                                        </div>
                                        <div className="mt-1 text-[11px] text-muted-foreground">
                                            {language === 'ko' ? `${holdings.length}개 종목` : `${holdings.length} holdings`}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-2">
                            {donutSegments.slice(0, 6).map((seg, i) => {
                                const w = (seg.value / (currentSummary.totalValue || 1)) * 100
                                const isSelected = selectedSegIdx === i
                                const isDimmed = selectedSegIdx !== null && !isSelected
                                return (
                                    <button
                                        key={seg.holding.id}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedSegIdx(isSelected ? null : i)
                                        }}
                                        className={cn(
                                            'flex items-center gap-2 min-w-0 transition-opacity text-left py-0.5',
                                            isDimmed && 'opacity-30',
                                        )}
                                    >
                                        <span
                                            className="w-2 h-2 rounded-sm shrink-0"
                                            style={{ background: seg.color }}
                                        />
                                        <span className="text-[11px] text-muted-foreground truncate flex-1">
                                            {seg.holding.stockCode}
                                        </span>
                                        <span className="text-[11px] font-bold text-foreground numeric">
                                            {w.toFixed(1)}%
                                        </span>
                                    </button>
                                )
                            })}
                            {donutSegments.length > 6 && (() => {
                                const restValue = donutSegments.slice(6).reduce((sum, s) => sum + s.value, 0)
                                const restWeight = (restValue / (currentSummary.totalValue || 1)) * 100
                                const restCount = donutSegments.length - 6
                                const restSelected = selectedSegIdx !== null && selectedSegIdx >= 6
                                const restDimmed = selectedSegIdx !== null && !restSelected
                                return (
                                    <div
                                        className={cn(
                                            'flex items-center gap-2 min-w-0 transition-opacity py-0.5',
                                            restDimmed && 'opacity-30',
                                        )}
                                    >
                                        <span className="w-2 h-2 rounded-sm shrink-0 bg-muted-foreground/40" />
                                        <span className="text-[11px] text-muted-foreground truncate flex-1">
                                            {language === 'ko' ? `기타 ${restCount}개` : `Others (${restCount})`}
                                        </span>
                                        <span className="text-[11px] font-bold text-foreground numeric">
                                            {restWeight.toFixed(1)}%
                                        </span>
                                    </div>
                                )
                            })()}
                            {currentSummary.cashBalance > 0 && (() => {
                                const totalAssets = currentSummary.totalValue + currentSummary.cashBalance
                                const cashWeight = totalAssets > 0
                                    ? (currentSummary.cashBalance / totalAssets) * 100
                                    : 0
                                const cashDimmed = selectedSegIdx !== null
                                return (
                                    <div
                                        className={cn(
                                            'flex items-center gap-2 min-w-0 transition-opacity py-0.5',
                                            cashDimmed && 'opacity-30',
                                        )}
                                    >
                                        <span className="w-2 h-2 rounded-sm shrink-0 bg-muted-foreground/40" />
                                        <span className="text-[11px] text-muted-foreground truncate flex-1">
                                            {language === 'ko' ? '예수금' : 'Cash'}
                                        </span>
                                        <span className="text-[11px] font-bold text-foreground numeric">
                                            {cashWeight.toFixed(1)}%
                                        </span>
                                    </div>
                                )
                            })()}
                        </div>

                        {hasUsdHolding && (
                            <ExchangeRateFootnote
                                rate={exRate}
                                updatedAt={currentSummary.exchangeRateUpdatedAt}
                                className="mt-3 pt-3 border-t border-border text-right"
                            />
                        )}
                    </section>
                )
            })()}

            {/* Cash balance — 예수금 (수정 트리거 포함) */}
            <section className="mx-4 mb-4 p-4 bg-card border border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-sm bg-accent-soft flex items-center justify-center shrink-0">
                        <Wallet className="w-4 h-4 text-primary" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                            {language === 'ko' ? '예수금' : 'Cash balance'}
                        </div>
                        <div className="font-serif text-lg font-semibold text-foreground mt-0.5 numeric truncate">
                            {formatCurrency(convert(currentSummary.cashBalance), baseCurrency)}
                        </div>
                    </div>
                </div>
                <CashBalanceDialog
                    initialBalance={currentSummary.cashBalance}
                    currency={baseCurrency}
                    exchangeRate={exRate}
                    onSuccess={refresh}
                >
                    <button
                        type="button"
                        className="text-[11px] font-bold tracking-wide text-primary px-3 py-2 inline-flex items-center gap-1 min-h-[40px] hover:bg-accent-soft transition-colors shrink-0"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                        {language === 'ko' ? '수정' : 'Edit'}
                    </button>
                </CashBalanceDialog>
            </section>

            {/* Holdings header — count + (다중 계좌 시) view-mode toggle + sort */}
            <div className="px-6 pb-3 flex justify-between items-center gap-2 flex-wrap">
                <span className="eyebrow">
                    {language === 'ko' ? '보유 종목' : 'Holdings'} · {baseHoldings.length}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                    {isMultiAccount && (
                        <div
                            role="tablist"
                            aria-label={language === 'ko' ? '보기 방식' : 'View mode'}
                            className="inline-flex border border-border rounded-sm overflow-hidden"
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={viewMode === 'byAccount'}
                                onClick={() => handleViewModeChange('byAccount')}
                                className={cn(
                                    'text-[11px] font-bold tracking-wide px-2.5 py-1 transition-colors',
                                    viewMode === 'byAccount'
                                        ? 'bg-foreground text-background'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {language === 'ko' ? '계좌별' : 'By account'}
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={viewMode === 'unified'}
                                onClick={() => handleViewModeChange('unified')}
                                className={cn(
                                    'text-[11px] font-bold tracking-wide px-2.5 py-1 border-l border-border transition-colors',
                                    viewMode === 'unified'
                                        ? 'bg-foreground text-background'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {language === 'ko' ? '통합' : 'Unified'}
                            </button>
                        </div>
                    )}
                    <SortToggle
                        active={sortKey === 'currentValue'}
                        dir={sortDir}
                        label={language === 'ko' ? '평가금' : 'Value'}
                        onClick={() => handleSort('currentValue')}
                    />
                    <SortToggle
                        active={sortKey === 'totalCost'}
                        dir={sortDir}
                        label={language === 'ko' ? '매입금' : 'Cost'}
                        onClick={() => handleSort('totalCost')}
                    />
                    <SortToggle
                        active={sortKey === 'profit'}
                        dir={sortDir}
                        label={language === 'ko' ? '수익금' : 'P/L'}
                        onClick={() => handleSort('profit')}
                    />
                </div>
            </div>

            {/* 계좌 탭 필터 — 계좌별 모드에서만 노출, 다중 계좌 한정 */}
            {isMultiAccount && viewMode === 'byAccount' && (
                <div className="px-6 pb-3">
                    <div
                        role="tablist"
                        aria-label={language === 'ko' ? '계좌 필터' : 'Account filter'}
                        className="flex gap-1 overflow-x-auto pb-1"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={accountFilter === 'all'}
                            onClick={() => handleAccountFilterChange('all')}
                            className={cn(
                                'shrink-0 text-[11px] font-bold tracking-wide px-3 py-1 rounded-sm border transition-colors',
                                accountFilter === 'all'
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-background text-muted-foreground border-border hover:text-foreground',
                            )}
                        >
                            {language === 'ko' ? '전체' : 'All'}
                        </button>
                        {accounts.map(a => (
                            <button
                                key={a.id}
                                type="button"
                                role="tab"
                                aria-selected={accountFilter === a.id}
                                onClick={() => handleAccountFilterChange(a.id)}
                                className={cn(
                                    'shrink-0 text-[11px] font-bold tracking-wide px-3 py-1 rounded-sm border transition-colors',
                                    accountFilter === a.id
                                        ? 'bg-foreground text-background border-foreground'
                                        : 'bg-background text-muted-foreground border-border hover:text-foreground',
                                )}
                            >
                                {a.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Holdings list */}
            <div className="px-4 pb-4 space-y-1.5">
                {holdingsWithWeight.length === 0 ? (
                    <div className="py-12 text-center">
                        <div className="text-sm text-muted-foreground">
                            {t('holdingsEmpty')}
                        </div>
                    </div>
                ) : isMultiAccount && viewMode === 'byAccount' ? (
                    // 계좌별 모드 — 계좌 단위 sticky header + 그 아래 카드들.
                    // accounts 정의 순서를 따름 (BrokerageAccount 의 createdAt 순). 미배정(accountId=null) row 는 끝에.
                    (() => {
                        const groups = new Map<string | null, typeof holdingsWithWeight>()
                        for (const h of holdingsWithWeight) {
                            const key = h.accountId ?? null
                            const list = groups.get(key) ?? []
                            list.push(h)
                            groups.set(key, list)
                        }
                        const ordered: Array<{ accountId: string | null; name: string; rows: typeof holdingsWithWeight }> = []
                        for (const a of accounts) {
                            const rows = groups.get(a.id)
                            if (rows && rows.length > 0) {
                                ordered.push({ accountId: a.id, name: a.name, rows })
                            }
                        }
                        const orphan = groups.get(null)
                        if (orphan && orphan.length > 0) {
                            ordered.push({
                                accountId: null,
                                name: language === 'ko' ? '미지정 계좌' : 'Unassigned',
                                rows: orphan,
                            })
                        }
                        // 계좌 탭 필터 적용 — 'all' 이 아니면 해당 계좌 그룹만
                        const visible = accountFilter === 'all'
                            ? ordered
                            : ordered.filter(g => g.accountId === accountFilter)
                        return visible.map(group => {
                            // 계좌 합계 (KRW 환산 기준):
                            //   - 평가금 = sum(currentValue * 현재환율 if USD else currentValue)
                            //   - 매입금 = sum(totalCost * 매입환율 if USD else totalCost)
                            //   - 수익금 = 평가금 - 매입금
                            let groupValueKrw = 0
                            let groupCostKrw = 0
                            let groupOldestPriceTime: string | null = null
                            for (const r of group.rows) {
                                const buyRate = r.currency === 'USD'
                                    ? (r.purchaseRate && r.purchaseRate !== 1 ? r.purchaseRate : exRate)
                                    : 1
                                groupValueKrw += r.currency === 'USD' ? r.currentValue * exRate : r.currentValue
                                groupCostKrw += r.currency === 'USD' ? r.totalCost * buyRate : r.totalCost
                                if (r.priceUpdatedAt && (!groupOldestPriceTime || new Date(r.priceUpdatedAt) < new Date(groupOldestPriceTime))) {
                                    groupOldestPriceTime = r.priceUpdatedAt
                                }
                            }
                            const groupProfitKrw = groupValueKrw - groupCostKrw
                            const groupValueDisplay = baseCurrency === 'KRW' ? groupValueKrw : groupValueKrw / exRate
                            const groupCostDisplay = baseCurrency === 'KRW' ? groupCostKrw : groupCostKrw / exRate
                            const groupProfitDisplay = baseCurrency === 'KRW' ? groupProfitKrw : groupProfitKrw / exRate
                            const isProfit = groupProfitKrw >= 0
                            return (
                                <div key={group.accountId ?? '__orphan'} className="space-y-1.5">
                                    {/* Sticky 계좌 헤더 — 종목명(좌) + 평가/매입/수익 3행(우) */}
                                    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm flex items-start justify-between gap-2 py-2 px-1 border-b border-border">
                                        <div className="flex flex-col gap-0 truncate pt-0.5 min-w-0">
                                            <span className="eyebrow truncate">{group.name}</span>
                                            <PriceUpdatedFootnote iso={groupOldestPriceTime} language={language} />
                                        </div>
                                        <div className="flex flex-col items-end gap-0 shrink-0 leading-tight">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-[10px] text-muted-foreground tracking-wide">
                                                    {language === 'ko' ? '평가' : 'Value'}
                                                </span>
                                                <span className="text-[12px] font-bold numeric text-foreground">
                                                    {formatCurrency(groupValueDisplay, baseCurrency)}
                                                </span>
                                            </div>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-[10px] text-muted-foreground tracking-wide">
                                                    {language === 'ko' ? '매입' : 'Cost'}
                                                </span>
                                                <span className="text-[10px] numeric text-muted-foreground">
                                                    {formatCurrency(groupCostDisplay, baseCurrency)}
                                                </span>
                                            </div>
                                            <div className={cn(
                                                'flex items-baseline gap-1',
                                                isProfit ? 'text-profit' : 'text-loss',
                                            )}>
                                                <span className="text-[10px] tracking-wide opacity-80">
                                                    {language === 'ko' ? '수익' : 'P/L'}
                                                </span>
                                                <span className="text-[10px] font-bold numeric">
                                                    {isProfit ? '+' : ''}{formatCurrency(groupProfitDisplay, baseCurrency)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        {group.rows.map(h => renderHoldingCard(h))}
                                    </div>
                                </div>
                            )
                        })
                    })()
                ) : (
                    // 통합 모드 또는 단일 계좌 — 합계 헤더 + 평탄한 카드 리스트
                    // 계좌별 모드의 그룹 헤더와 동일 디자인 (라벨 "전체"/"Total")
                    (() => {
                        const totalValueDisplay = convert(currentSummary.totalValue)
                        const totalCostDisplay = convert(currentSummary.totalCost)
                        const totalProfitDisplay = convert(currentSummary.totalProfit)
                        const isProfit = currentSummary.totalProfit >= 0
                        // 전체 종목 중 가장 오래된 주가 갱신 시점 — 사용자에게 캐시 시점 안내
                        let oldestPriceTime: string | null = null
                        for (const h of holdings) {
                            if (!h.priceUpdatedAt) continue
                            if (!oldestPriceTime || new Date(h.priceUpdatedAt) < new Date(oldestPriceTime)) {
                                oldestPriceTime = h.priceUpdatedAt
                            }
                        }
                        return (
                            <>
                                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm flex items-start justify-between gap-2 py-2 px-1 border-b border-border">
                                    <div className="flex flex-col gap-0 truncate pt-0.5 min-w-0">
                                        <span className="eyebrow truncate">
                                            {language === 'ko' ? '전체' : 'Total'}
                                        </span>
                                        <PriceUpdatedFootnote iso={oldestPriceTime} language={language} />
                                    </div>
                                    <div className="flex flex-col items-end gap-0 shrink-0 leading-tight">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-[10px] text-muted-foreground tracking-wide">
                                                {language === 'ko' ? '평가' : 'Value'}
                                            </span>
                                            <span className="text-[12px] font-bold numeric text-foreground">
                                                {formatCurrency(totalValueDisplay, baseCurrency)}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-[10px] text-muted-foreground tracking-wide">
                                                {language === 'ko' ? '매입' : 'Cost'}
                                            </span>
                                            <span className="text-[10px] numeric text-muted-foreground">
                                                {formatCurrency(totalCostDisplay, baseCurrency)}
                                            </span>
                                        </div>
                                        <div className={cn(
                                            'flex items-baseline gap-1',
                                            isProfit ? 'text-profit' : 'text-loss',
                                        )}>
                                            <span className="text-[10px] tracking-wide opacity-80">
                                                {language === 'ko' ? '수익' : 'P/L'}
                                            </span>
                                            <span className="text-[10px] font-bold numeric">
                                                {isProfit ? '+' : ''}{formatCurrency(totalProfitDisplay, baseCurrency)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {holdingsWithWeight.map(h => renderHoldingCard(h))}
                            </>
                        )
                    })()
                )}
            </div>

            {mounted && createPortal(
                <AddHoldingFloating
                    open={showAdd}
                    onOpenChange={handleDrawerChange}
                    newStock={newStock}
                    setNewStock={handleStockSelect}
                    newQty={newQty}
                    setNewQty={setNewQty}
                    newPrice={newPrice}
                    setNewPrice={setNewPrice}
                    newPurchaseRate={newPurchaseRate}
                    setNewPurchaseRate={setNewPurchaseRate}
                    adding={adding}
                    handleAdd={handleAdd}
                    existingHolding={existingHolding}
                    addMode={addMode}
                    setAddMode={setAddMode}
                    accounts={accounts}
                    accountId={newAccountId}
                    setAccountId={setNewAccountId}
                    t={t}
                    language={language}
                />,
                document.body,
            )}
            {/* 종목 삭제 확인 — native confirm() 대체. 계좌 삭제 다이얼로그와 일관성 */}
            <ConfirmDialog
                open={!!deleteTargetId}
                onOpenChange={(next) => { if (!next) setDeleteTargetId(null) }}
                title={language === 'ko' ? '종목 삭제' : 'Delete holding'}
                description={
                    deleteTargetHolding
                        ? language === 'ko'
                            ? `"${deleteTargetHolding.stockName}"을(를) 삭제하시겠습니까?`
                            : `Delete "${deleteTargetHolding.stockName}"?`
                        : language === 'ko'
                            ? '이 종목을 삭제하시겠습니까?'
                            : 'Delete this holding?'
                }
                confirmLabel={language === 'ko' ? '삭제' : 'Delete'}
                cancelLabel={language === 'ko' ? '취소' : 'Cancel'}
                variant="destructive"
                onConfirm={performDelete}
            />
            <TransferHoldingDialog
                open={!!transferTargetId}
                onOpenChange={(next) => { if (!next) setTransferTargetId(null) }}
                holding={transferTargetHolding}
                accounts={accounts}
                onTransferred={refresh}
                language={language}
            />
        </div>
    )
}

interface AddHoldingFloatingProps {
    open: boolean
    onOpenChange: (next: boolean) => void
    newStock: any
    setNewStock: (s: any) => void
    newQty: string
    setNewQty: (s: string) => void
    newPrice: string
    setNewPrice: (s: string) => void
    newPurchaseRate: string
    setNewPurchaseRate: (s: string) => void
    adding: boolean
    handleAdd: () => void
    existingHolding: Holding | null
    addMode: 'merge' | 'overwrite'
    setAddMode: (m: 'merge' | 'overwrite') => void
    accounts: BrokerageAccountOption[]
    accountId: string | null
    setAccountId: (id: string) => void
    t: (key: any) => string
    language: 'ko' | 'en'
}

function AddHoldingFloating({
    open, onOpenChange,
    newStock, setNewStock,
    newQty, setNewQty,
    newPrice, setNewPrice,
    newPurchaseRate, setNewPurchaseRate,
    adding, handleAdd,
    existingHolding, addMode, setAddMode,
    accounts, accountId, setAccountId,
    t, language,
}: AddHoldingFloatingProps) {
    const isKR = newStock?.market === 'KOSPI' || newStock?.market === 'KOSDAQ'
    const isUSD = !!newStock && !isKR
    const pricePrefix = newStock ? (isKR ? '₩' : '$') : undefined
    const qtySuffix = language === 'ko' ? '주' : 'shr'

    return (
        <>
            {/* FAB — AI chat 위쪽에 위치 (탭바+gap+AiChat 높이+gap) */}
            <button
                type="button"
                onClick={() => onOpenChange(true)}
                aria-label={language === 'ko' ? '종목 추가' : 'Add holding'}
                className="fixed right-4 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all duration-150"
                style={{
                    bottom: 'calc(64px + 12px + var(--safe-bottom, 0px))',
                }}
            >
                <Plus className="w-5 h-5" strokeWidth={2.5} />
            </button>

            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>{language === 'ko' ? '종목 추가' : 'Add holding'}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {language === 'ko' ? '검색하여 보유 종목을 추가합니다.' : 'Search and add a holding.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2.5">
                        <StockSearchCombobox
                            value={newStock?.stockName || ''}
                            onSelect={(s: any) => setNewStock(s)}
                            disabled={adding}
                        />
                        {/* 계좌 셀렉터 — 단일 계좌 사용자에게는 자동으로 숨김 (AccountSelector 자체 처리).
                            마지막 사용 계좌를 localStorage 에 영속화. */}
                        <AccountSelector
                            accounts={accounts}
                            value={accountId}
                            onChange={setAccountId}
                            rememberKey={RECENT_ACCOUNT_STORAGE_KEY}
                            disabled={adding}
                            label={language === 'ko' ? '계좌' : 'Account'}
                        />
                        {existingHolding && (
                            <div className="border border-border bg-accent-soft rounded-md p-3 space-y-2.5">
                                <div className="text-[11px] text-muted-foreground leading-snug">
                                    {language === 'ko' ? (
                                        <>
                                            이미 보유 중인 종목입니다 — <span className="numeric font-semibold text-foreground">{formatNumber(existingHolding.quantity)}{qtySuffix}</span>
                                            {' · '}
                                            {language === 'ko' ? '평단' : 'Avg'} <span className="numeric font-semibold text-foreground">{(existingHolding.currency === 'KRW' ? '₩' : '$') + formatNumber(existingHolding.averagePrice)}</span>
                                        </>
                                    ) : (
                                        <>
                                            You already hold this stock — <span className="numeric font-semibold text-foreground">{formatNumber(existingHolding.quantity)} shr</span>
                                            {' · '}
                                            Avg <span className="numeric font-semibold text-foreground">{(existingHolding.currency === 'KRW' ? '₩' : '$') + formatNumber(existingHolding.averagePrice)}</span>
                                        </>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setAddMode('merge')}
                                        disabled={adding}
                                        className={cn(
                                            'py-2 text-[12px] font-bold rounded-sm border transition-colors',
                                            addMode === 'merge'
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-background text-foreground border-border hover:bg-accent-soft',
                                        )}
                                    >
                                        {language === 'ko' ? '물타기 (평단 합산)' : 'Average down (merge)'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAddMode('overwrite')}
                                        disabled={adding}
                                        className={cn(
                                            'py-2 text-[12px] font-bold rounded-sm border transition-colors',
                                            addMode === 'overwrite'
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-background text-foreground border-border hover:bg-accent-soft',
                                        )}
                                    >
                                        {language === 'ko' ? '덮어쓰기' : 'Overwrite'}
                                    </button>
                                </div>
                                <div className="text-[10.5px] text-muted-foreground leading-snug">
                                    {addMode === 'merge'
                                        ? (language === 'ko' ? '입력한 수량을 더하고 평단가는 가중평균으로 계산됩니다.' : 'Quantity is added; average price is recalculated as a weighted mean.')
                                        : (language === 'ko' ? '기존 보유분을 입력값으로 교체합니다.' : 'Existing holding is replaced with the new values.')}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <FormattedNumberInput
                                label={t('quantity')}
                                suffix={qtySuffix}
                                value={newQty}
                                onChange={setNewQty}
                                disabled={adding}
                            />
                            <FormattedNumberInput
                                label={t('averagePrice')}
                                prefix={pricePrefix}
                                value={newPrice}
                                onChange={setNewPrice}
                                disabled={adding}
                            />
                        </div>
                        {isUSD && (
                            <FormattedNumberInput
                                label={language === 'ko' ? '매입환율 (₩/$)' : 'Buy rate (KRW/USD)'}
                                value={newPurchaseRate}
                                onChange={setNewPurchaseRate}
                                disabled={adding}
                            />
                        )}
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={!newStock || !newQty || !newPrice || adding}
                            className="w-full bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 hover:opacity-90 rounded-md"
                        >
                            {adding
                                ? t('addingProgress')
                                : existingHolding
                                    ? (addMode === 'merge'
                                        ? (language === 'ko' ? '물타기' : 'Average down')
                                        : (language === 'ko' ? '덮어쓰기' : 'Overwrite'))
                                    : t('add')}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

/**
 * 합계/그룹 헤더 좌측 라벨 아래에 "주가 3분 전" 표시.
 * 실시간 시세가 아닌 캐시 시점임을 사용자에게 안내해 증권사 앱과의 평가금 차이 컴플레인 예방.
 * useRelativeTime 이 1분 간격으로 자동 재계산.
 */
function PriceUpdatedFootnote({
    iso, language,
}: {
    iso: string | null
    language: 'ko' | 'en'
}) {
    const relative = useRelativeTime(iso)
    if (!iso || !relative) return null
    return (
        <span className="text-[10px] text-muted-foreground truncate">
            {language === 'ko' ? `주가 ${relative}` : `Price ${relative}`}
        </span>
    )
}

function SortToggle({
    active, dir, label, onClick,
}: {
    active: boolean
    dir: SortDir
    label: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'text-[11px] font-bold tracking-wide px-2 py-1 inline-flex items-center gap-0.5 transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
        >
            {label}
            {active && (dir === 'desc'
                ? <ArrowDown className="w-3 h-3" />
                : <ArrowUp className="w-3 h-3" />
            )}
        </button>
    )
}
