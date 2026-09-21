'use client'

import { useMemo, useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { SnapshotDiff } from './snapshot-diff'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import type { SnapshotDetail, CurrentHoldingSummary } from '@/types/snapshot'

interface Props {
    open: boolean
    snapshots: SnapshotDetail[]
    currentHoldings: CurrentHoldingSummary[]
    onClose: () => void
    language: string
}

type Tab = 'summary' | 'holdings' | 'diff'

/**
 * 종목 행의 금액을 원화로 환산한다.
 *
 * snapshot_holdings 의 금액은 **네이티브 통화**다. USD 행에만 환율을 곱하되,
 * 매입액은 purchaseRate(매입 시점 동결), 평가액은 스냅샷 exchangeRate 를 쓴다.
 * 이 규약을 어기면 금액이 환율배로 부푼다 (커밋 8a14ede 가 고친 사고).
 */
function toKRW(value: number, currency: string, rate: number): number {
    return currency === 'USD' ? value * rate : value
}

export function SnapshotCompareSheet({ open, snapshots, currentHoldings, onClose, language }: Props) {
    const ko = language === 'ko'
    const [tab, setTab] = useState<Tab>('summary')

    // 날짜 오름차순 — 표의 열 순서가 시간 순서와 같아야 추이를 읽을 수 있다.
    const ordered = useMemo(
        () => [...snapshots].sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime()),
        [snapshots],
    )

    /**
     * 열 머리글. 같은 날 스냅샷이 둘 이상이면(수동 생성 + 자동 생성 등) 날짜만으로는
     * 구분이 안 되므로 그 날짜에 한해 시각을 덧붙인다.
     */
    const labelById = useMemo(() => {
        const counts = new Map<string, number>()
        for (const s of ordered) {
            const d = formatDate(s.snapshotDate, 'yy.MM.dd')
            counts.set(d, (counts.get(d) ?? 0) + 1)
        }
        const out: Record<string, string> = {}
        for (const s of ordered) {
            const d = formatDate(s.snapshotDate, 'yy.MM.dd')
            out[s.id] = (counts.get(d) ?? 0) > 1 ? `${d} ${formatDate(s.snapshotDate, 'HH:mm')}` : d
        }
        return out
    }, [ordered])

    // 종목 탭: 행=종목, 열=스냅샷. 어느 스냅샷에도 없는 종목은 나오지 않는다.
    const holdingRows = useMemo(() => {
        const names = new Map<string, string>()
        const byCode = new Map<string, Map<string, { price: number; qty: number }>>()

        for (const snap of ordered) {
            const fx = Number(snap.exchangeRate) || 1
            for (const h of snap.holdings) {
                const code = h.stockCode
                if (!names.has(code)) names.set(code, h.stock?.nameKo || code)
                if (!byCode.has(code)) byCode.set(code, new Map())
                const price = toKRW(Number(h.currentPrice), h.currency, fx)
                const prev = byCode.get(code)!.get(snap.id)
                // 같은 종목이 여러 행으로 들어있는 스냅샷이 있다(계좌 분리 등) → 수량만 합산.
                byCode.get(code)!.set(snap.id, {
                    price,
                    qty: (prev?.qty ?? 0) + h.quantity,
                })
            }
        }

        return Array.from(byCode.entries())
            .map(([code, perSnap]) => ({
                code,
                name: names.get(code) ?? code,
                cells: ordered.map((s) => perSnap.get(s.id) ?? null),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, ko ? 'ko' : 'en'))
    }, [ordered, ko])

    if (!open || ordered.length === 0) return null

    const tabCls = (active: boolean) =>
        cn(
            'px-3 py-1.5 text-[0.75rem] font-bold rounded-md transition-colors',
            active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        )

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <span className="text-[0.9375rem] font-bold text-foreground">
                    {ko ? `스냅샷 비교 · ${ordered.length}개` : `Compare · ${ordered.length}`}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={ko ? '닫기' : 'Close'}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* 탭 */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-border shrink-0">
                <button type="button" className={tabCls(tab === 'summary')} onClick={() => setTab('summary')}>
                    {ko ? '요약' : 'Summary'}
                </button>
                <button type="button" className={tabCls(tab === 'holdings')} onClick={() => setTab('holdings')}>
                    {ko ? '종목' : 'Holdings'}
                </button>
                {ordered.length === 2 && (
                    <button type="button" className={tabCls(tab === 'diff')} onClick={() => setTab('diff')}>
                        {ko ? '상세' : 'Detail'}
                    </button>
                )}
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-auto">
                {tab === 'summary' && (
                    <table className="w-full text-[0.75rem]">
                        <thead className="sticky top-0 bg-background">
                            <tr className="text-muted-foreground">
                                <th className="text-left font-semibold px-4 py-2">{ko ? '날짜' : 'Date'}</th>
                                <th className="text-right font-semibold px-3 py-2">{ko ? '총자산' : 'Assets'}</th>
                                <th className="text-right font-semibold px-3 py-2">{ko ? '수익률' : 'Return'}</th>
                                <th className="text-right font-semibold px-4 py-2">{ko ? '종목' : 'Items'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ordered.map((s) => {
                                const rate = Number(s.profitRate)
                                const up = rate >= 0
                                return (
                                    <tr key={s.id} className="border-t border-border">
                                        <td className="px-4 py-2.5 font-semibold text-foreground numeric whitespace-nowrap">
                                            {labelById[s.id]}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-foreground numeric whitespace-nowrap">
                                            {formatCurrency(Number(s.totalValue), 'KRW')}
                                        </td>
                                        <td className={cn('px-3 py-2.5 text-right font-bold numeric whitespace-nowrap', up ? 'text-profit' : 'text-loss')}>
                                            {up ? '+' : ''}{rate.toFixed(2)}%
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-muted-foreground numeric">
                                            {s.holdings.length}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}

                {tab === 'holdings' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[0.75rem]">
                            <thead className="sticky top-0 bg-background">
                                <tr className="text-muted-foreground">
                                    <th className="text-left font-semibold px-4 py-2 sticky left-0 bg-background">
                                        {ko ? '종목' : 'Stock'}
                                    </th>
                                    {ordered.map((s) => (
                                        <th key={s.id} className="text-right font-semibold px-3 py-2 whitespace-nowrap numeric">
                                            {labelById[s.id]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {holdingRows.map((row) => (
                                    <tr key={row.code} className="border-t border-border">
                                        <td className="px-4 py-2.5 sticky left-0 bg-background">
                                            <div className="font-semibold text-foreground truncate max-w-[130px]">{row.name}</div>
                                            <div className="text-[0.625rem] text-muted-foreground">{row.code}</div>
                                        </td>
                                        {row.cells.map((cell, i) => (
                                            <td key={i} className="px-3 py-2.5 text-right numeric whitespace-nowrap">
                                                {cell ? (
                                                    <>
                                                        <div className="text-foreground">{formatCurrency(cell.price, 'KRW')}</div>
                                                        <div className="text-[0.625rem] text-muted-foreground">
                                                            {cell.qty}{ko ? '주' : ''}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'diff' && ordered.length === 2 && (
                    <div className="p-4">
                        <SnapshotDiff
                            currentHoldings={currentHoldings}
                            snapshots={ordered}
                            selectedIds={ordered.map((s) => s.id)}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
