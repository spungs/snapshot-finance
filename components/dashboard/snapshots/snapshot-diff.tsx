'use client'

import { useMemo } from 'react'

import { useLanguage } from '@/lib/i18n/context'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatters'
import { ArrowRight, Plus, Minus, ArrowRightLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    currentHoldings: any[]
    snapshots: any[]
    selectedIds: string[]
}

export function SnapshotDiff({ currentHoldings, snapshots, selectedIds }: Props) {
    const { t, language } = useLanguage()

    const diffData = useMemo(() => {
        if (!snapshots || snapshots.length === 0) return null

        let targetSnapshots: any[] = []
        let isDefault = false

        if (selectedIds.length === 0) {
            if (snapshots.length < 2) return null
            targetSnapshots = [snapshots[0], snapshots[1]]
            isDefault = true
        } else if (selectedIds.length === 1) {
            return { status: 'select_one_more' }
        } else if (selectedIds.length === 2) {
            const s1 = snapshots.find(s => s.id === selectedIds[0])
            const s2 = snapshots.find(s => s.id === selectedIds[1])
            if (!s1 || !s2) return null
            targetSnapshots = [s1, s2].sort(
                (a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime(),
            )
        } else {
            return { status: 'select_only_two' }
        }

        const [newSn, oldSn] = targetSnapshots

        const normalize = (items: any[]) => {
            const map = new Map<string, any>()
            items.forEach(item => {
                map.set(item.stock.stockCode, {
                    name: item.stock.stockName,
                    code: item.stock.stockCode,
                    quantity: item.quantity,
                })
            })
            return map
        }

        const getDiff = (newMap: Map<string, any>, oldMap: Map<string, any>) => {
            const added: any[] = []
            const removed: any[] = []
            const modified: any[] = []
            let isIdentical = true

            for (const [code, item] of newMap) {
                if (!oldMap.has(code)) {
                    added.push(item)
                    isIdentical = false
                } else {
                    const old = oldMap.get(code)
                    if (Number(old.quantity) !== Number(item.quantity)) {
                        modified.push({
                            name: item.name,
                            code: item.code,
                            oldQty: old.quantity,
                            newQty: item.quantity,
                            diffQty: Number(item.quantity) - Number(old.quantity),
                        })
                        isIdentical = false
                    }
                }
            }

            for (const [, item] of oldMap) {
                if (!newMap.has(item.code)) {
                    removed.push(item)
                    isIdentical = false
                }
            }

            return { added, removed, modified, isIdentical }
        }

        const newMap = normalize(newSn.holdings)
        const oldMap = normalize(oldSn.holdings)
        const diff = getDiff(newMap, oldMap)

        return {
            diff,
            oldSn,
            newSn,
            leftTitle: formatDate(newSn.snapshotDate, 'yyyy-MM-dd HH:mm'),
            rightTitle: formatDate(oldSn.snapshotDate, 'yyyy-MM-dd HH:mm'),
            isDefault,
        }
    }, [snapshots, selectedIds])

    if (!diffData) return null

    if ('status' in diffData) {
        const message =
            diffData.status === 'select_one_more' ? t('selectOneMore') : t('selectOnlyTwo')
        return (
            <div className="p-8 text-center text-muted-foreground font-medium bg-muted/20 rounded-lg border">
                {message}
            </div>
        )
    }

    const { diff, oldSn, newSn, rightTitle, leftTitle } = diffData as any
    const { added, removed, modified, isIdentical } = diff

    if (isIdentical) {
        return (
            <div className="space-y-3">
                <SnapshotSummaryRow oldSn={oldSn} newSn={newSn} language={language} />
                <div className="p-5 text-center bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-900/30">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 justify-center">
                            <ArrowRightLeft className="w-4 h-4 text-green-600 shrink-0" />
                            <span className="font-semibold text-sm break-keep">
                                {language === 'ko'
                                    ? '두 포트폴리오가 동일합니다.'
                                    : 'Portfolios are identical.'}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground break-keep">
                            {language === 'ko' ? '변동사항이 없습니다.' : 'No changes.'}
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* 두 스냅샷 핵심 지표 요약 */}
            <SnapshotSummaryRow oldSn={oldSn} newSn={newSn} language={language} />

            {/* 변경됨 — 기존 보유 종목 변화, 가장 중요 */}
            {modified.length > 0 && (
                <Section
                    icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
                    label={t('compModified')}
                    count={modified.length}
                    color="amber"
                >
                    {modified.map((item: any) => {
                        const isIncrease = item.diffQty > 0
                        return (
                            <div
                                key={item.code}
                                className="bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2.5 rounded border border-amber-100 dark:border-amber-900/30 flex items-center gap-3"
                            >
                                <StockLabel name={item.name} code={item.code} />
                                <div className="flex items-center gap-1.5 shrink-0 text-xs">
                                    <span className="text-muted-foreground line-through">
                                        {formatNumber(item.oldQty)}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                                    <span className="font-bold">
                                        {formatNumber(item.newQty)}{t('countUnit')}
                                    </span>
                                    <span
                                        className={cn(
                                            'px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                                            isIncrease
                                                ? 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                                                : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
                                        )}
                                    >
                                        {isIncrease ? '+' : ''}{formatNumber(item.diffQty)}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </Section>
            )}

            {/* 추가됨 — 신규 진입 */}
            {added.length > 0 && (
                <Section
                    icon={<Plus className="w-3.5 h-3.5" />}
                    label={t('compAdded')}
                    count={added.length}
                    color="blue"
                >
                    {added.map((item: any) => (
                        <div
                            key={item.code}
                            className="bg-blue-50/50 dark:bg-blue-900/10 px-3 py-2.5 rounded border border-blue-100 dark:border-blue-900/30 flex items-center gap-3"
                        >
                            <StockLabel name={item.name} code={item.code} />
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                {formatNumber(item.quantity)}{t('countUnit')}
                            </span>
                        </div>
                    ))}
                </Section>
            )}

            {/* 제거됨 — 완전 청산 */}
            {removed.length > 0 && (
                <Section
                    icon={<Minus className="w-3.5 h-3.5" />}
                    label={t('compRemoved')}
                    count={removed.length}
                    color="red"
                >
                    {removed.map((item: any) => (
                        <div
                            key={item.code}
                            className="bg-red-50/50 dark:bg-red-900/10 px-3 py-2.5 rounded border border-red-100 dark:border-red-900/30 flex items-center gap-3 opacity-60"
                        >
                            <StockLabel name={item.name} code={item.code} strikethrough />
                            <span className="shrink-0 text-xs font-medium text-muted-foreground line-through">
                                {formatNumber(item.quantity)}{t('countUnit')}
                            </span>
                        </div>
                    ))}
                </Section>
            )}
        </div>
    )
}

function Section({
    icon,
    label,
    count,
    color,
    children,
}: {
    icon: React.ReactNode
    label: string
    count: number
    color: 'amber' | 'blue' | 'red'
    children: React.ReactNode
}) {
    const colorMap = {
        amber: 'text-amber-600',
        blue: 'text-blue-600',
        red: 'text-red-600',
    }
    return (
        <div className="space-y-1.5">
            <h4 className={cn('text-[10px] font-bold flex items-center gap-1.5 uppercase tracking-widest', colorMap[color])}>
                {icon} {label} <span className="opacity-60">({count})</span>
            </h4>
            <div className="space-y-1.5">{children}</div>
        </div>
    )
}

function SnapshotSummaryRow({ oldSn, newSn, language }: { oldSn: any; newSn: any; language: string }) {
    const currency: 'KRW' | 'USD' = language === 'en' && oldSn.exchangeRate ? 'USD' : 'KRW'
    const exchangeRate = (sn: any) => language === 'en' && sn.exchangeRate ? Number(sn.exchangeRate) : 1

    const items = [
        {
            date: formatDate(oldSn.snapshotDate, 'yy.MM.dd'),
            totalValue: Number(oldSn.totalValue) / exchangeRate(oldSn),
            profitRate: Number(oldSn.profitRate),
        },
        {
            date: formatDate(newSn.snapshotDate, 'yy.MM.dd'),
            totalValue: Number(newSn.totalValue) / exchangeRate(newSn),
            profitRate: Number(newSn.profitRate),
        },
    ]

    return (
        <div className="grid grid-cols-2 gap-2">
            {items.map((item, i) => (
                <div
                    key={i}
                    className="bg-muted/40 rounded-lg px-3 py-2.5 space-y-1"
                >
                    <div className="text-[10px] font-semibold text-muted-foreground tracking-wider">
                        {item.date}
                    </div>
                    <div className="text-sm font-bold text-foreground numeric leading-tight">
                        {formatCurrency(item.totalValue, currency)}
                    </div>
                    <div className={cn(
                        'text-[11px] font-semibold numeric',
                        item.profitRate >= 0 ? 'text-profit' : 'text-loss',
                    )}>
                        {item.profitRate >= 0 ? '▲' : '▼'}{Math.abs(item.profitRate).toFixed(2)}%
                    </div>
                </div>
            ))}
        </div>
    )
}

function StockLabel({
    name,
    code,
    strikethrough = false,
}: {
    name: string
    code: string
    strikethrough?: boolean
}) {
    return (
        <span className={cn('flex-1 min-w-0 text-sm font-medium truncate', strikethrough && 'line-through')}>
            {name}
            <span className="text-muted-foreground font-normal text-[11px] ml-1.5">({code})</span>
        </span>
    )
}
