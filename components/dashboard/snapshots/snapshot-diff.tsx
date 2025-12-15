'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { useLanguage } from '@/lib/i18n/context'
import { formatDate, formatNumber } from '@/lib/utils/formatters'
import { ArrowRight, Plus, Minus, ArrowRightLeft } from 'lucide-react'

interface Props {
    currentHoldings: any[]
    snapshots: any[]
    selectedIds: string[]
}

export function SnapshotDiff({ currentHoldings, snapshots, selectedIds }: Props) {
    const { t } = useLanguage()

    const diffData = useMemo(() => {
        if (!snapshots || snapshots.length === 0) return null

        // 1. Determine which snapshots to compare
        let targetSnapshots: any[] = []
        let isDefault = false

        if (selectedIds.length === 0) {
            // Default: Compare 1st(New) vs 2nd(Old)
            if (snapshots.length < 2) return null
            targetSnapshots = [snapshots[0], snapshots[1]]
            isDefault = true
        } else if (selectedIds.length === 1) {
            return { status: 'select_one_more' }
        } else if (selectedIds.length === 2) {
            // Find the selected snapshots
            const s1 = snapshots.find(s => s.id === selectedIds[0])
            const s2 = snapshots.find(s => s.id === selectedIds[1])
            if (!s1 || !s2) return null

            // Sort by date descending (New first)
            targetSnapshots = [s1, s2].sort((a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime())
        } else {
            return { status: 'select_only_two' }
        }

        const [newSn, oldSn] = targetSnapshots

        // Normalize: Map by stockCode
        const normalize = (items: any[]) => {
            const map = new Map()
            items.forEach(item => {
                const code = item.stock.stockCode
                const name = item.stock.stockName
                map.set(code, {
                    name,
                    quantity: item.quantity,
                    code
                })
            })
            return map
        }

        // Compare A (New) vs B (Old)
        const getDiff = (newMap: Map<string, any>, oldMap: Map<string, any>) => {
            const added: any[] = []
            const removed: any[] = []
            const modified: any[] = []
            let isIdentical = true

            // Added & Modified
            for (const [code, item] of newMap) {
                if (!oldMap.has(code)) {
                    added.push(item)
                    isIdentical = false
                } else {
                    const oldItem = oldMap.get(code)
                    if (Number(oldItem.quantity) !== Number(item.quantity)) {
                        modified.push({ name: item.name, code: item.code, oldQty: oldItem.quantity, newQty: item.quantity })
                        isIdentical = false
                    }
                }
            }

            // Removed
            for (const [code, item] of oldMap) {
                if (!newMap.has(code)) {
                    removed.push(item)
                    isIdentical = false
                }
            }

            return { added, removed, modified, isIdentical }
        }

        const newMap = normalize(newSn.holdings)
        const oldMap = normalize(oldSn.holdings)

        const diff = getDiff(newMap, oldMap)
        const leftTitle = `${t('snapshots')} (${formatDate(newSn.snapshotDate, 'yyyy-MM-dd HH:mm')})`
        const rightTitle = `${t('snapshots')} (${formatDate(oldSn.snapshotDate, 'yyyy-MM-dd HH:mm')})`

        return { diff, leftTitle, rightTitle, isDefault }
    }, [currentHoldings, snapshots, selectedIds, t])

    if (!diffData) return null

    if (!diffData) return null

    // Status handling
    if ('status' in diffData) {
        let message = ''
        if (diffData.status === 'select_one_more') message = t('selectOneMore')
        if (diffData.status === 'select_only_two') message = t('selectOnlyTwo')

        return (
            <Card className="border-l-4 border-l-muted/50 mt-8 mb-8 shadow-sm">
                <CardContent className="p-8 text-center text-muted-foreground font-medium">
                    {message}
                </CardContent>
            </Card>
        )
    }

    const { diff, leftTitle, rightTitle, isDefault } = diffData as any
    const { added, removed, modified, isIdentical } = diff

    if (isIdentical) {
        return (
            <Card className="border-l-4 border-l-green-500/70 mt-8 mb-8 shadow-sm">
                <CardHeader className="pb-3 border-b bg-muted/20">
                    <CardTitle className="text-lg flex items-center gap-3">
                        <ArrowRightLeft className="w-5 h-5 text-primary" />
                        {t('portfolioComparison')}
                        <Badge variant="secondary" className="font-normal">{rightTitle} vs {leftTitle}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8 text-center text-muted-foreground font-medium">
                    {t('comparisonIdentical')}
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-l-4 border-l-primary/70 mt-8 mb-8 shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
                <CardTitle className="text-lg flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5 text-primary" />
                        {t('portfolioComparison')}
                        {isDefault && <Badge variant="outline" className="text-xs font-normal ml-2">{t('defaultComparison')}</Badge>}
                    </div>

                    <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground ml-0 sm:ml-auto bg-background px-3 py-1 rounded-full border shadow-sm">
                        <span>{rightTitle}</span>
                        <ArrowRight className="w-4 h-4" />
                        <span className="font-semibold text-foreground">{leftTitle}</span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="w-full p-4">
                    <div className="space-y-6">
                        {/* Added */}
                        {added.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold flex items-center gap-2 text-blue-600">
                                    <Plus className="w-4 h-4" /> {t('compAdded')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {added.map((item: any) => (
                                        <div key={item.code} className="bg-blue-50/50 dark:bg-blue-900/10 p-2 rounded flex justify-between items-center text-sm border border-blue-100 dark:border-blue-900/30">
                                            <span className="font-medium">
                                                {item.name} <span className="text-muted-foreground font-normal text-xs">({item.code})</span>
                                            </span>
                                            <span className="text-muted-foreground">{formatNumber(item.quantity)}{t('countUnit')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Modified */}
                        {modified.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-600">
                                    <ArrowRightLeft className="w-4 h-4" /> {t('compModified')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {modified.map((item: any) => {
                                        const diffVal = item.newQty - item.oldQty
                                        const isPos = diffVal > 0
                                        return (
                                            <div key={item.code} className="bg-amber-50/50 dark:bg-amber-900/10 p-2 rounded flex justify-between items-center text-sm border border-amber-100 dark:border-amber-900/30">
                                                <span className="font-medium">
                                                    {item.name} <span className="text-muted-foreground font-normal text-xs">({item.code})</span>
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground line-through text-xs">{formatNumber(item.oldQty)}</span>
                                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                                    <span className="font-bold">{formatNumber(item.newQty)}{t('countUnit')}</span>
                                                    <Badge variant="outline" className={isPos ? "text-red-500 border-red-200 ml-1" : "text-blue-500 border-blue-200 ml-1"}>
                                                        {isPos ? '+' : ''}{formatNumber(diffVal)}
                                                    </Badge>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Removed */}
                        {removed.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold flex items-center gap-2 text-red-600">
                                    <Minus className="w-4 h-4" /> {t('compRemoved')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {removed.map((item: any) => (
                                        <div key={item.code} className="bg-red-50/50 dark:bg-red-900/10 p-2 rounded flex justify-between items-center text-sm border border-red-100 dark:border-red-900/30">
                                            <span className="font-medium">
                                                {item.name} <span className="text-muted-foreground font-normal text-xs">({item.code})</span>
                                            </span>
                                            <span className="text-muted-foreground line-through">{formatNumber(item.quantity)}{t('countUnit')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
