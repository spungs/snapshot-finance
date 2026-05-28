'use client'

import { useState } from 'react'
import { RefreshCw, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { cn } from '@/lib/utils'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import type { AnalyzedItem } from '@/app/actions/admin-actions'

/* ───────── ReviewCard 모델 (export — 이미지/텍스트 모드 양쪽 import) ───────── */

export type ReviewCard = {
    /** 안정적 key — uuid 같지만 외부 의존성 피하기 위해 인덱스+identifier 조합. */
    id: string
    analyzed: AnalyzedItem
    draft: {
        stockCode?: string
        stockName?: string
        market?: string
        currency?: string
        effectiveRate?: number
        quantity: number
        averagePrice: number
        purchaseRate?: number
    }
    selected: boolean
    replaced: boolean
}

export function buildInitialCards(resolved: AnalyzedItem[], unresolved: AnalyzedItem[]): ReviewCard[] {
    const cards: ReviewCard[] = []
    resolved.forEach((a, i) => {
        cards.push({
            id: `r-${i}-${a.stockCode ?? a.identifier}`,
            analyzed: a,
            draft: {
                stockCode: a.stockCode,
                stockName: a.stockName,
                market: a.market,
                currency: a.currency,
                effectiveRate: a.effectiveRate,
                quantity: a.inputQty,
                averagePrice: a.inputPrice,
                // effectiveRate fallback 제거 — OCR 이 환율 명시 추출 안 한 경우 input 은 빈 칸 + placeholder 표시.
                purchaseRate: a.inputRate,
            },
            // 평단가가 캡쳐에 없어 0 으로 들어오면 사용자가 직접 입력해야 등록 가능.
            selected: a.inputPrice > 0,
            replaced: false,
        })
    })
    unresolved.forEach((a, i) => {
        cards.push({
            id: `u-${i}-${a.identifier}`,
            analyzed: a,
            draft: {
                quantity: a.inputQty,
                averagePrice: a.inputPrice,
            },
            selected: false,
            replaced: false,
        })
    })
    return cards
}

/* ───────── ReviewList — 통합 표시 컴포넌트 ───────── */

export interface ReviewListProps {
    cards: ReviewCard[]
    onUpdate: (next: ReviewCard[], edited: boolean) => void
    onSubmit: (strategy: 'overwrite' | 'add') => void
    /** 이미지 모드 한정 — 썸네일 + 카운트 + 이미지 변경 버튼. 텍스트 모드는 undefined. */
    imageHeader?: { previewUrl: string; onChangeImage: () => void }
}

export function ReviewList({ cards, onUpdate, onSubmit, imageHeader }: ReviewListProps) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const [strategy, setStrategy] = useState<'overwrite' | 'add'>('overwrite')

    const updateCard = (id: string, patch: Partial<ReviewCard>) => {
        const next = cards.map(c => (c.id === id ? { ...c, ...patch } : c))
        onUpdate(next, true)
    }
    const removeCard = (id: string) => {
        onUpdate(cards.filter(c => c.id !== id), true)
    }

    const total = cards.length
    const ready = cards.filter(c => c.selected && c.draft.stockCode && c.draft.averagePrice > 0).length

    return (
        <div className="space-y-3">
            {imageHeader && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageHeader.previewUrl}
                        alt={tx.ocrThumbnailAlt}
                        width={48}
                        height={48}
                        className="w-12 h-12 object-cover rounded border border-border shrink-0"
                    />
                    <div className="flex-1 text-[11px] text-muted-foreground min-w-0">
                        {tx.ocrCountSummary.replace('{total}', String(total)).replace('{ready}', String(ready))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={imageHeader.onChangeImage} className="shrink-0">
                        <RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">{tx.ocrChangeImage}</span>
                    </Button>
                </div>
            )}

            {!imageHeader && (
                <div className="text-[11px] text-muted-foreground">
                    {tx.ocrCountSummary.replace('{total}', String(total)).replace('{ready}', String(ready))}
                </div>
            )}

            {/* 데스크톱 테이블 (sm+) */}
            <div className="hidden sm:block max-h-[50vh] overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-accent-soft/50 text-[10px] uppercase tracking-wide text-muted-foreground sticky top-0">
                        <tr>
                            <th className="w-8 px-2 py-2"></th>
                            <th className="text-left px-2 py-2">{tx.stock}</th>
                            <th className="text-left px-2 py-2 w-20">{tx.quantity}</th>
                            <th className="text-left px-2 py-2 w-28">{tx.averagePrice}</th>
                            <th className="text-left px-2 py-2 w-28">{tx.rate}</th>
                            <th className="w-12 px-2 py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {cards.map(card => (
                            <ReviewRowDesktop
                                key={card.id}
                                card={card}
                                onChange={patch => updateCard(card.id, patch)}
                                onRemove={() => removeCard(card.id)}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 모바일 콤팩트 카드 (sm 미만) */}
            <div className="sm:hidden space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {cards.map(card => (
                    <ReviewCardMobile
                        key={card.id}
                        card={card}
                        onChange={patch => updateCard(card.id, patch)}
                        onRemove={() => removeCard(card.id)}
                    />
                ))}
            </div>

            <div>
                <label className="block text-[11px] font-bold tracking-wide text-muted-foreground mb-1.5 uppercase">
                    {tx.strategy}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                    <button
                        type="button"
                        onClick={() => setStrategy('overwrite')}
                        className={cn(
                            'py-2 text-[12px] font-bold rounded-sm border transition-colors',
                            strategy === 'overwrite'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:bg-accent-soft',
                        )}
                    >
                        {tx.strategyOverwrite}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStrategy('add')}
                        className={cn(
                            'py-2 text-[12px] font-bold rounded-sm border transition-colors',
                            strategy === 'add'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:bg-accent-soft',
                        )}
                    >
                        {tx.strategyAdd}
                    </button>
                </div>
            </div>

            <Button type="button" onClick={() => onSubmit(strategy)} disabled={ready === 0} className="w-full">
                {tx.ocrSubmitButton.replace('{count}', String(ready))}
            </Button>
        </div>
    )
}

/* ───────── Desktop Row ───────── */

function ReviewRowDesktop({ card, onChange, onRemove }: {
    card: ReviewCard
    onChange: (patch: Partial<ReviewCard>) => void
    onRemove: () => void
}) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const [showSwap, setShowSwap] = useState(false)
    const isResolved = !!card.draft.stockCode
    const isUSD = card.draft.currency === 'USD'
    const showCombo = !isResolved || showSwap
    const priceMissing = card.draft.averagePrice <= 0

    return (
        <>
            <tr className={cn(
                'border-t border-border',
                !isResolved && 'bg-amber-500/5',
                priceMissing && isResolved && 'bg-amber-500/5',
            )}>
                <td className="px-2 py-2 align-top">
                    <input
                        type="checkbox"
                        checked={card.selected}
                        onChange={e => onChange({ selected: e.target.checked })}
                        disabled={!isResolved}
                        className="w-4 h-4"
                        aria-label="등록 대상 선택"
                    />
                </td>
                <td className="px-2 py-2 align-top">
                    {isResolved ? (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm">{card.draft.stockName}</span>
                            <span className="text-[10px] text-muted-foreground">{card.draft.stockCode}</span>
                            {isUSD && <span className="text-[10px] bg-accent-soft px-1.5 py-0.5 rounded">USD</span>}
                            {card.replaced && <span className="text-[10px] text-amber-600">교체됨</span>}
                        </div>
                    ) : (
                        <div className="text-[11px] text-amber-700">
                            {tx.ocrUnresolvedHint}
                            <div className="opacity-70 mt-0.5 truncate">원문: &quot;{card.analyzed.identifier}&quot;</div>
                        </div>
                    )}
                </td>
                <td className="px-2 py-2 align-top">
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={card.draft.quantity}
                        onChange={e => {
                            const raw = e.target.value
                            if (raw === '') return
                            const num = Number(raw)
                            if (!Number.isFinite(num) || num < 0) return
                            onChange({ draft: { ...card.draft, quantity: Math.trunc(num) } })
                        }}
                        className="w-full border border-input bg-background rounded-sm h-8 px-2 text-sm"
                    />
                </td>
                <td className="px-2 py-2 align-top">
                    <input
                        type="number"
                        min={0}
                        step={0.0001}
                        value={card.draft.averagePrice || ''}
                        onChange={e => {
                            const raw = e.target.value
                            if (raw === '') {
                                onChange({ draft: { ...card.draft, averagePrice: 0 } })
                                return
                            }
                            const num = Number(raw)
                            if (!Number.isFinite(num) || num < 0) return
                            onChange({ draft: { ...card.draft, averagePrice: num }, selected: num > 0 && !!card.draft.stockCode })
                        }}
                        placeholder={priceMissing ? tx.ocrEnterPrice : undefined}
                        className={cn(
                            'w-full border bg-background rounded-sm h-8 px-2 text-sm',
                            priceMissing ? 'border-amber-500' : 'border-input',
                        )}
                    />
                </td>
                <td className="px-2 py-2 align-top">
                    {isUSD ? (
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={card.draft.purchaseRate || ''}
                            placeholder={
                                card.draft.effectiveRate
                                    ? card.draft.effectiveRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    : tx.rate
                            }
                            onChange={e => {
                                const raw = e.target.value
                                if (raw === '') {
                                    onChange({ draft: { ...card.draft, purchaseRate: undefined } })
                                    return
                                }
                                const num = Number(raw)
                                if (!Number.isFinite(num) || num < 0) return
                                onChange({ draft: { ...card.draft, purchaseRate: num } })
                            }}
                            className="w-full border border-input bg-background rounded-sm h-8 px-2 text-sm"
                        />
                    ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                </td>
                <td className="px-2 py-2 align-top text-right">
                    {isResolved && !showSwap && (
                        <button
                            type="button"
                            onClick={() => setShowSwap(true)}
                            className="text-muted-foreground hover:text-foreground mr-1 inline-flex"
                            aria-label={tx.ocrChangeStock}
                            title={tx.ocrChangeStock}
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-muted-foreground hover:text-destructive inline-flex"
                        aria-label="카드 제거"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </td>
            </tr>
            {showCombo && (
                <tr className="border-t border-border bg-background/50">
                    <td></td>
                    <td colSpan={5} className="px-2 py-2">
                        <StockSearchCombobox
                            value={card.draft.stockName ?? ''}
                            inline
                            onSelect={stock => {
                                onChange({
                                    draft: {
                                        ...card.draft,
                                        stockCode: stock.stockCode,
                                        stockName: stock.nameKo || stock.stockName,
                                        market: stock.market,
                                        currency: stock.market === 'KOSPI' || stock.market === 'KOSDAQ' ? 'KRW' : 'USD',
                                    },
                                    selected: card.draft.averagePrice > 0,
                                    replaced: true,
                                })
                                if (isResolved) setShowSwap(false)
                            }}
                        />
                    </td>
                </tr>
            )}
        </>
    )
}

/* ───────── Mobile Compact Card ───────── */

function ReviewCardMobile({ card, onChange, onRemove }: {
    card: ReviewCard
    onChange: (patch: Partial<ReviewCard>) => void
    onRemove: () => void
}) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const [showSwap, setShowSwap] = useState(false)
    const isResolved = !!card.draft.stockCode
    const isUSD = card.draft.currency === 'USD'
    const showCombo = !isResolved || showSwap
    const priceMissing = card.draft.averagePrice <= 0

    return (
        <div className={cn(
            'rounded-md border p-2.5 space-y-2',
            !isResolved
                ? 'border-amber-500/50 bg-amber-500/5'
                : priceMissing
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-border bg-background',
        )}>
            <div className="flex items-center gap-2 min-w-0">
                <input
                    type="checkbox"
                    checked={card.selected}
                    onChange={e => onChange({ selected: e.target.checked })}
                    disabled={!isResolved}
                    className="w-4 h-4 shrink-0"
                />
                <div className="flex-1 min-w-0">
                    {isResolved ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-sm truncate">{card.draft.stockName}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{card.draft.stockCode}</span>
                            {isUSD && <span className="text-[9px] bg-accent-soft px-1 py-0.5 rounded shrink-0">USD</span>}
                        </div>
                    ) : (
                        <div className="text-[11px] text-amber-700 truncate">{tx.ocrUnresolvedHint} (&quot;{card.analyzed.identifier}&quot;)</div>
                    )}
                </div>
                {isResolved && !showSwap && (
                    <button type="button" onClick={() => setShowSwap(true)} className="text-muted-foreground shrink-0" aria-label={tx.ocrChangeStock}>
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                )}
                <button type="button" onClick={onRemove} className="text-muted-foreground shrink-0" aria-label="카드 제거">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {showCombo && (
                <StockSearchCombobox
                    value={card.draft.stockName ?? ''}
                    inline
                    onSelect={stock => {
                        onChange({
                            draft: {
                                ...card.draft,
                                stockCode: stock.stockCode,
                                stockName: stock.nameKo || stock.stockName,
                                market: stock.market,
                                currency: stock.market === 'KOSPI' || stock.market === 'KOSDAQ' ? 'KRW' : 'USD',
                            },
                            selected: card.draft.averagePrice > 0,
                            replaced: true,
                        })
                        if (isResolved) setShowSwap(false)
                    }}
                />
            )}

            <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px]">
                    <div className="text-muted-foreground mb-0.5">{tx.quantity}</div>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={card.draft.quantity}
                        onChange={e => {
                            const raw = e.target.value
                            if (raw === '') return
                            const num = Number(raw)
                            if (!Number.isFinite(num) || num < 0) return
                            onChange({ draft: { ...card.draft, quantity: Math.trunc(num) } })
                        }}
                        className="w-full border border-input bg-background rounded-sm h-9 px-2 text-sm"
                    />
                </label>
                <label className="text-[10px]">
                    <div className="text-muted-foreground mb-0.5 inline-flex items-center gap-1">
                        {tx.averagePrice}
                        {priceMissing && <span className="text-amber-600 text-[9px]">{tx.ocrPriceMissing}</span>}
                    </div>
                    <input
                        type="number"
                        min={0}
                        step={0.0001}
                        value={card.draft.averagePrice || ''}
                        onChange={e => {
                            const raw = e.target.value
                            if (raw === '') {
                                onChange({ draft: { ...card.draft, averagePrice: 0 } })
                                return
                            }
                            const num = Number(raw)
                            if (!Number.isFinite(num) || num < 0) return
                            onChange({ draft: { ...card.draft, averagePrice: num }, selected: num > 0 && !!card.draft.stockCode })
                        }}
                        placeholder={priceMissing ? tx.ocrEnterPrice : undefined}
                        className={cn(
                            'w-full border bg-background rounded-sm h-9 px-2 text-sm',
                            priceMissing ? 'border-amber-500' : 'border-input',
                        )}
                    />
                </label>
            </div>

            {isUSD && (
                <label className="text-[10px] block">
                    <div className="text-muted-foreground mb-0.5">{tx.rate}</div>
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={card.draft.purchaseRate || ''}
                        placeholder={
                            card.draft.effectiveRate
                                ? card.draft.effectiveRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : tx.rate
                        }
                        onChange={e => {
                            const raw = e.target.value
                            if (raw === '') {
                                onChange({ draft: { ...card.draft, purchaseRate: undefined } })
                                return
                            }
                            const num = Number(raw)
                            if (!Number.isFinite(num) || num < 0) return
                            onChange({ draft: { ...card.draft, purchaseRate: num } })
                        }}
                        className="w-full border border-input bg-background rounded-sm h-9 px-2 text-sm"
                    />
                </label>
            )}

            {card.replaced && <div className="text-[10px] text-amber-600 pl-6">교체됨</div>}
        </div>
    )
}
