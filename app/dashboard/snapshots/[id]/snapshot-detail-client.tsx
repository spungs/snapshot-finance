'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, MoreVertical, Pencil, Trash2, Loader2, AlertCircle } from 'lucide-react'

import { useLanguage } from '@/lib/i18n/context'
import { snapshotsApi } from '@/lib/api/client'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SnapshotHolding {
    id: string
    quantity: number
    currency: string
    averagePrice: number
    currentPrice: number
    totalCost: number
    currentValue: number
    profit: number
    profitRate: number
    purchaseRate: number
    stock: { stockCode: string; stockName: string }
}

interface Snapshot {
    id: string
    snapshotDate: string
    createdAt: string
    note?: string | null
    totalValue: number
    totalCost: number
    totalProfit: number
    profitRate: number
    cashBalance: number
    exchangeRate: number
    holdings: SnapshotHolding[]
}

interface Props {
    snapshot: Snapshot
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

export default function SnapshotDetailClient({ snapshot }: Props) {
    const { t, language } = useLanguage()
    const router = useRouter()
    const [isDeleting, setIsDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isEn = language === 'en'
    const currency: 'KRW' | 'USD' = isEn ? 'USD' : 'KRW'
    const rate = snapshot.exchangeRate || 1435

    const conv = (v: number) => (isEn && rate ? v / rate : v)

    const totalValue = conv(Number(snapshot.totalValue))
    const totalCost = conv(Number(snapshot.totalCost))
    const totalProfit = conv(Number(snapshot.totalProfit))
    const cashBalance = conv(Number(snapshot.cashBalance))
    const stockValue = totalValue - cashBalance
    const profitRate = Number(snapshot.profitRate)
    const isProfit = totalProfit >= 0

    // KRW total stock value for weight computation (so KRW/USD holdings can be summed)
    const stockTotalKRW = snapshot.holdings.reduce((sum, h) => {
        const valKRW = h.currency === 'USD' ? Number(h.currentValue) * rate : Number(h.currentValue)
        return sum + valKRW
    }, 0)

    async function handleDelete() {
        if (!confirm(t('confirmDelete'))) return
        setIsDeleting(true)
        try {
            const res = await snapshotsApi.delete(snapshot.id)
            if (res.success) {
                router.push('/dashboard/snapshots')
            } else {
                setError(res.error?.message || t('deleteFailed'))
                setIsDeleting(false)
            }
        } catch {
            setError(t('networkError'))
            setIsDeleting(false)
        }
    }

    return (
        <div className="max-w-[420px] mx-auto w-full pb-8">
            {/* Hero — back link + title */}
            <section className="px-6 pt-3 pb-4">
                <Link
                    href="/dashboard/snapshots"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tracking-[0.5px] hover:text-foreground transition-colors mb-2"
                >
                    <ChevronLeft className="w-3 h-3" />
                    {t('snapshotList')}
                </Link>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="hero-serif text-[32px] text-foreground leading-tight">
                            {t('snapshotDetail')}
                        </h1>
                        <span
                            className="serif-italic text-xs text-muted-foreground block mt-1"
                            suppressHydrationWarning
                        >
                            {formatDate(snapshot.snapshotDate, 'yyyy.MM.dd')}
                        </span>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                disabled={isDeleting}
                                className="p-2 -mr-2 text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0"
                                aria-label={language === 'ko' ? '더보기' : 'More'}
                            >
                                {isDeleting
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <MoreVertical className="w-4 h-4" />}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[160px]">
                            <DropdownMenuItem
                                onClick={() => router.push(`/dashboard/snapshots/${snapshot.id}/edit`)}
                                className="cursor-pointer"
                            >
                                <Pencil className="w-4 h-4 mr-2" /> {t('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={handleDelete}
                                className="cursor-pointer text-destructive focus:text-destructive"
                            >
                                <Trash2 className="w-4 h-4 mr-2" /> {t('deleteSnapshot')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </section>

            {error && (
                <section className="mx-4 mb-4 bg-card border border-loss/40 p-4 flex gap-3">
                    <AlertCircle className="h-4 w-4 text-loss shrink-0 mt-0.5" />
                    <div>
                        <div className="text-[11px] font-bold text-loss tracking-[0.5px] uppercase">
                            {t('error')}
                        </div>
                        <div className="text-[13px] text-foreground mt-1">{error}</div>
                    </div>
                </section>
            )}

            {/* Memo */}
            {snapshot.note && (
                <section className="mx-4 mb-4 bg-card border border-border p-4">
                    <div className="eyebrow mb-1.5">
                        {language === 'ko' ? 'MEMO' : 'MEMO'}
                    </div>
                    <p className="serif-italic text-[13px] text-foreground leading-relaxed break-words">
                        “{snapshot.note}”
                    </p>
                </section>
            )}

            {/* Summary card */}
            <div className="mx-4 mb-2 relative overflow-hidden border bg-card" style={{ padding: 22 }}>
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary" />

                <div className="flex items-center justify-between mb-1">
                    <span className="eyebrow">
                        {language === 'ko' ? `SNAPSHOT · 기록` : 'SNAPSHOT'}
                    </span>
                    <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                        {formatDate(snapshot.snapshotDate, 'HH:mm')}
                        {' · '}
                        {snapshot.holdings.length}{t('countUnit')} {t('stock')}
                    </span>
                </div>

                <div className="font-serif text-[22px] text-foreground mt-1.5" suppressHydrationWarning>
                    {formatDate(snapshot.snapshotDate, 'yyyy.MM.dd')}
                </div>

                <div className="text-[11px] font-semibold text-muted-foreground tracking-[0.5px] mt-3.5 mb-1">
                    {t('totalValue')}
                </div>
                <div className="amount-display text-[30px] text-foreground leading-none">
                    {formatCurrency(totalValue, currency)}
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
                            {isProfit ? '+' : ''}{formatCurrency(totalProfit, currency)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Two-up: stock value / cash */}
            <section className="mx-4 mb-4 grid grid-cols-2 gap-2">
                <div className="p-4 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {t('stockValue')}
                    </div>
                    <div className="font-serif text-lg font-semibold text-foreground mt-1.5 numeric">
                        {formatCurrency(stockValue, currency)}
                    </div>
                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-2 pt-2 border-t border-border/60 flex justify-between">
                        <span>{t('totalCost')}</span>
                        <span className="numeric text-foreground">{formatCurrency(totalCost, currency)}</span>
                    </div>
                </div>
                <div className="p-4 bg-card border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                        {t('cash')}
                    </div>
                    <div className="font-serif text-lg font-semibold text-foreground mt-1.5 numeric">
                        {formatCurrency(cashBalance, currency)}
                    </div>
                    {isEn && (
                        <div className="text-[10px] text-muted-foreground tracking-[0.5px] mt-2 pt-2 border-t border-border/60 flex justify-between">
                            <span>Rate</span>
                            <span className="numeric text-foreground">{formatNumber(rate, 0)}</span>
                        </div>
                    )}
                </div>
            </section>

            {/* Holdings list header */}
            <div className="px-6 pb-3 flex justify-between items-center">
                <span className="eyebrow">
                    {language === 'ko'
                        ? `HOLDINGS · ${snapshot.holdings.length}`
                        : `HOLDINGS · ${snapshot.holdings.length}`}
                </span>
                <span className="text-[10px] text-muted-foreground tracking-[0.5px]">
                    {t('holdings')}
                </span>
            </div>

            {snapshot.holdings.length === 0 ? (
                <div className="mx-4 p-8 bg-card border border-border text-center">
                    <p className="text-[12px] text-muted-foreground">{t('holdingsEmpty')}</p>
                </div>
            ) : (
                <div className="px-4 space-y-1.5">
                    {snapshot.holdings.map((h) => {
                        const isItemUp = Number(h.profit) >= 0
                        const itemCurrency: 'KRW' | 'USD' =
                            isEn ? 'USD' : (h.currency as 'KRW' | 'USD')

                        let avgPrice = Number(h.averagePrice)
                        let curPrice = Number(h.currentPrice)
                        let profit = Number(h.profit)
                        if (isEn && h.currency === 'KRW') {
                            avgPrice = avgPrice / rate
                            curPrice = curPrice / rate
                            profit = profit / rate
                        }

                        const valKRW = h.currency === 'USD'
                            ? Number(h.currentValue) * rate
                            : Number(h.currentValue)
                        const weight = stockTotalKRW > 0 ? (valKRW / stockTotalKRW) * 100 : 0

                        return (
                            <div
                                key={h.id}
                                className="bg-card border border-border p-4"
                                style={{
                                    borderLeftWidth: '3px',
                                    borderLeftColor: isItemUp ? 'var(--profit)' : 'var(--loss)',
                                }}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="font-serif text-[15px] font-semibold text-foreground leading-snug break-keep flex-1 min-w-0">
                                        {h.stock.stockName}
                                    </div>
                                    <UpDown value={Number(h.profitRate)} />
                                </div>

                                <div className="mt-1.5 flex items-end justify-between gap-3">
                                    <div className="text-[10px] text-muted-foreground tracking-[0.5px] flex-1 min-w-0">
                                        {h.stock.stockCode}
                                        {' · '}
                                        {formatNumber(h.quantity)}{language === 'ko' ? '주' : 'shr'}
                                        {' · '}
                                        {language === 'ko'
                                            ? `비중 ${formatNumber(weight, 1)}%`
                                            : `${formatNumber(weight, 1)}% wt`}
                                    </div>
                                    <div className={cn(
                                        'text-[14px] font-bold numeric shrink-0',
                                        isItemUp ? 'text-profit' : 'text-loss',
                                    )}>
                                        {isItemUp ? '+' : ''}{formatCurrency(profit, itemCurrency)}
                                    </div>
                                </div>

                                <div className="mt-2.5 pt-2.5 border-t border-border/60 grid grid-cols-2 gap-3 text-[11px]">
                                    <div>
                                        <div className="text-[10px] text-muted-foreground tracking-[0.5px] uppercase">
                                            {t('averagePrice')}
                                        </div>
                                        <div className="font-serif text-[13px] font-semibold text-foreground mt-0.5 numeric">
                                            {formatCurrency(avgPrice, itemCurrency)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-muted-foreground tracking-[0.5px] uppercase">
                                            {t('currentPrice')}
                                        </div>
                                        <div className="font-serif text-[13px] font-semibold text-foreground mt-0.5 numeric">
                                            {formatCurrency(curPrice, itemCurrency)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
