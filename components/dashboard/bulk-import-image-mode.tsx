'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Loader2, Upload, AlertCircle, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { cn } from '@/lib/utils'
import type { AnalyzedItem } from '@/app/actions/admin-actions'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_RAW_BYTES = 10 * 1024 * 1024 // 10MB
// 압축 결과의 디코드된 raw bytes 상한.
// 3MB (서버 한계와 정합, Vercel function body 4.5MB 안전 마진 — base64 인코딩 후 ~4MB + JSON wrapping).
const TARGET_BASE64_BYTES = 3 * 1024 * 1024

type OcrResponseBody = {
    success: boolean
    resolved?: AnalyzedItem[]
    unresolved?: AnalyzedItem[]
    detected?: number
    error?: string
    code?: string
}

/**
 * 카드 한 장의 사용자 편집 가능 모델.
 * - analyzed: 서버가 반환한 원본 (불변, 표시 참고용)
 * - draft: 사용자가 inline edit 한 현재 값
 * - selected: 등록 대상 체크 여부. resolved 는 자동 true, ambiguous/unresolved 는 false 시작.
 * - replaced: 사용자가 종목 검색 콤보로 카드의 종목을 교체한 경우 true — 화면 표시용.
 */
type ReviewCard = {
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

function buildInitialCards(resolved: AnalyzedItem[], unresolved: AnalyzedItem[]): ReviewCard[] {
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
                purchaseRate: a.inputRate ?? a.effectiveRate,
            },
            selected: true,
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

type ImageModeState =
    | { kind: 'idle' }
    | { kind: 'analyzing'; previewUrl: string }
    | { kind: 'review'; previewUrl: string; cards: ReviewCard[]; edited: boolean }
    | { kind: 'submitting'; previewUrl: string; resolved: AnalyzedItem[]; unresolved: AnalyzedItem[] }
    | { kind: 'error'; previewUrl?: string; message: string }

export interface BulkImportImageModeProps {
    accountId: string
    /** 사용자가 카드 리스트에서 확정 버튼을 눌렀을 때 부모(=BulkImportDialog)에 알림. */
    onSubmit: (items: AnalyzedItem[], strategy: 'overwrite' | 'add') => Promise<void>
    /** 부모가 다이얼로그 close 등의 이유로 컴포넌트 reset 을 강제할 때. */
    resetSignal: number
}

/**
 * 이미지를 canvas 로 압축해 OCR 페이로드용 base64(prefix 없음)와
 * 화면 표시용 작은 previewUrl(dataURL, 320px) 을 함께 반환한다.
 *
 * 1차: maxWidth 1920, maxHeight 4096, quality 0.92 → 2차(>3MB): 1280×2560, 0.82.
 * RGBA 비트맵 메모리 폭주를 막기 위해 MAX_PIXELS(4096×8192) 초과는 사전 거부.
 * 실패 시 throw — 호출부에서 toast.
 */
async function compressImage(file: File): Promise<{
    base64: string         // OCR 페이로드용 (prefix 없음)
    mimeType: string
    bytes: number
    previewUrl: string     // 화면 표시용 작은 dataUrl (320px, q 0.7)
}> {
    const objectUrl = URL.createObjectURL(file)
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image()
            el.onload = () => resolve(el)
            el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다. PNG·JPG·WEBP 형식이 맞는지 확인해주세요.'))
            el.src = objectUrl
        })

        const tryEncode = (maxWidth: number, maxHeight: number, quality: number): { dataUrl: string; bytes: number } => {
            // 가로/세로 한도 중 더 강한 쪽으로 다운스케일.
            const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight)
            const w = Math.max(1, Math.round(img.naturalWidth * scale))
            const h = Math.max(1, Math.round(img.naturalHeight * scale))
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('canvas 2d context 생성 실패')
            ctx.drawImage(img, 0, 0, w, h)
            // JPEG 으로 통일 — OCR 입력으로 충분하고 base64 크기 가장 작음.
            const dataUrl = canvas.toDataURL('image/jpeg', quality)
            const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
            const bytes = Math.floor((base64.length * 3) / 4)
            return { dataUrl, bytes }
        }

        // 사전 가드: 비현실적으로 큰 이미지는 거부 (RGBA 비트맵 메모리 폭주 방지).
        // 4096x8192 = 134MB RGBA — 모바일 임계점 정도로 보수적 상한.
        const MAX_PIXELS = 4096 * 8192
        if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
            throw new Error('이미지 해상도가 너무 큽니다.')
        }

        // 1차 압축: maxWidth 1920, maxHeight 4096 (긴 스크롤 캡쳐도 흡수)
        let result = tryEncode(1920, 4096, 0.92)

        // 3MB 초과면 2차 압축: maxWidth 1280, maxHeight 2560, quality 0.82 — 해상도 유지 + quality 만 추가로 낮춤.
        if (result.bytes > TARGET_BASE64_BYTES) {
            result = tryEncode(1280, 2560, 0.82)
        }

        if (result.bytes > TARGET_BASE64_BYTES) {
            throw new Error('이미지 압축 후에도 크기가 너무 큽니다.')
        }

        // 화면 미리보기용 (작게) — state 에 4MB string 보관 회피.
        const previewUrl = tryEncode(320, 320, 0.7).dataUrl

        // OCR 페이로드에서 prefix 제거 — 서버 길이 검증 정합.
        const base64 = result.dataUrl.slice(result.dataUrl.indexOf(',') + 1)

        return { base64, mimeType: 'image/jpeg', bytes: result.bytes, previewUrl }
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

export function BulkImportImageMode({ accountId, onSubmit, resetSignal }: BulkImportImageModeProps) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [state, setState] = useState<ImageModeState>({ kind: 'idle' })
    // 진행 중인 OCR 요청을 취소하기 위한 컨트롤러 — race condition 방지.
    const abortRef = useRef<AbortController | null>(null)

    // 부모가 reset 요청 시(다이얼로그 close 등) 진행 중 요청을 abort 하고 idle 로 복귀.
    // resetSignal 은 외부 시스템(부모의 명령적 신호)이므로 effect 안에서 setState 가 의도된 동작.
    useEffect(() => {
        abortRef.current?.abort()
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState(s => (s.kind === 'idle' ? s : { kind: 'idle' }))
    }, [resetSignal])

    // 컴포넌트 unmount 시 in-flight 요청 정리 — 메모리 누수·dead state setState 방지.
    useEffect(() => () => abortRef.current?.abort(), [])

    const handleFile = useCallback(async (file: File) => {
        // 진행 중 이전 요청 abort — 새 파일 선택 시 race 방지.
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        // mimeType 1차 검증
        if (!ACCEPTED_MIME_TYPES.includes(file.type as typeof ACCEPTED_MIME_TYPES[number])) {
            toast.error(tx.ocrUnsupportedFormat)
            return
        }
        if (file.size > MAX_RAW_BYTES) {
            toast.error(tx.ocrTooLarge)
            return
        }

        let compressed: { base64: string; mimeType: string; previewUrl: string }
        try {
            compressed = await compressImage(file)
        } catch (e) {
            console.error('[bulk-import-image-mode] compress failed:', e)
            if (controller.signal.aborted) return
            toast.error(tx.ocrCompressFailed)
            return
        }

        if (controller.signal.aborted) return

        const previewUrl = compressed.previewUrl
        setState({ kind: 'analyzing', previewUrl })

        try {
            const res = await fetch('/api/ai/ocr-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: compressed.base64,
                    mimeType: compressed.mimeType,
                }),
                signal: controller.signal,
            })
            if (controller.signal.aborted) return
            const body = (await res.json()) as OcrResponseBody
            if (controller.signal.aborted) return

            if (!res.ok || !body.success) {
                const message =
                    body.code === 'PRO_REQUIRED'
                        ? tx.ocrProOnly
                        : body.code === 'OCR_DAILY_LIMIT'
                            ? tx.ocrDailyLimit
                            : res.status === 429
                                ? tx.ocrBurstLimit
                                : body.error || tx.ocrAnalysisFailed
                setState({ kind: 'error', previewUrl, message })
                toast.error(message)
                return
            }

            const resolved = body.resolved ?? []
            const unresolved = body.unresolved ?? []

            if (resolved.length === 0 && unresolved.length === 0) {
                setState({ kind: 'error', previewUrl, message: tx.ocrEmptyResult })
                toast.warning(tx.ocrEmptyResult)
                return
            }

            setState({
                kind: 'review',
                previewUrl,
                cards: buildInitialCards(resolved, unresolved),
                edited: false,
            })
        } catch (e) {
            if (controller.signal.aborted) return
            console.error('[bulk-import-image-mode] fetch failed:', e)
            setState({ kind: 'error', previewUrl, message: tx.ocrAnalysisFailed })
            toast.error(tx.ocrAnalysisFailed)
        }
    }, [tx])

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleFile(file)
        // 같은 파일 재선택 가능하도록 input value 초기화.
        e.target.value = ''
    }

    const handleChangeImage = () => {
        if (state.kind === 'review' && state.edited) {
            if (!window.confirm(tx.ocrChangeImageConfirm)) return
        }
        fileInputRef.current?.click()
    }

    const handleSubmit = useCallback(
        async (strategy: 'overwrite' | 'add') => {
            if (state.kind !== 'review') return

            // 카드 중 selected + stockCode 있는 것만 → AnalyzedItem 형태로 부모에게 전달.
            // executeBulkImport 는 stockCode/identifier 기반 lookup 이므로 draft 의 stockCode 를 identifier 로.
            const items: AnalyzedItem[] = state.cards
                .filter(c => c.selected && c.draft.stockCode)
                .map(c => ({
                    ...c.analyzed,
                    stockCode: c.draft.stockCode,
                    stockName: c.draft.stockName ?? c.analyzed.stockName,
                    market: c.draft.market ?? c.analyzed.market,
                    currency: c.draft.currency ?? c.analyzed.currency,
                    inputQty: c.draft.quantity,
                    inputPrice: c.draft.averagePrice,
                    inputRate: c.draft.purchaseRate,
                    effectiveRate: c.draft.effectiveRate ?? c.analyzed.effectiveRate,
                    status: 'resolved' as const,
                }))

            if (items.length === 0) {
                toast.error(tx.nothingToImportDesc)
                return
            }

            setState({
                kind: 'submitting',
                previewUrl: state.previewUrl,
                resolved: items,
                unresolved: [],
            })

            try {
                await onSubmit(items, strategy)
                // 부모(BulkImportDialog) 가 성공 후 close + reset 처리. 여기서는 idle 로 복귀하지 않음.
            } catch (e) {
                console.error('[bulk-import-image-mode] submit failed:', e)
                setState({
                    kind: 'error',
                    previewUrl: state.previewUrl,
                    message: tx.ocrAnalysisFailed,
                })
                toast.error(tx.ocrAnalysisFailed)
            }
        },
        [state, onSubmit, tx],
    )

    // -------- 렌더 --------
    return (
        <div className="space-y-3">
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_MIME_TYPES.join(',')}
                onChange={handleFileInputChange}
                className="hidden"
            />

            {state.kind === 'idle' && (
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            fileInputRef.current?.click()
                        }
                    }}
                    onPaste={e => {
                        const items = e.clipboardData?.items
                        if (!items) return
                        for (const item of items) {
                            if (item.kind === 'file' && item.type.startsWith('image/')) {
                                const file = item.getAsFile()
                                if (file) {
                                    e.preventDefault()
                                    void handleFile(file)
                                    return
                                }
                            }
                        }
                    }}
                    aria-disabled={!accountId}
                    className={cn(
                        'w-full rounded-md border border-dashed border-primary/60 bg-accent-soft/30',
                        'px-4 py-8 text-sm text-center text-muted-foreground',
                        'hover:bg-accent-soft/50 transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        !accountId && 'opacity-50 pointer-events-none',
                    )}
                >
                    <Upload className="w-5 h-5 mx-auto mb-2 opacity-70" />
                    {tx.ocrUploadHint}
                </div>
            )}

            {state.kind === 'analyzing' && (
                <div className="rounded-md border border-border bg-accent-soft/30 px-4 py-8 text-sm text-center text-muted-foreground inline-flex flex-col items-center gap-2 w-full">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {tx.ocrAnalyzing}
                </div>
            )}

            {state.kind === 'error' && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive inline-flex items-center gap-1.5 w-full">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="flex-1">{state.message}</span>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1 text-[11px] underline"
                    >
                        <RefreshCw className="w-3 h-3" /> {tx.ocrRetry}
                    </button>
                </div>
            )}

            {state.kind === 'review' && (
                <ReviewCardList
                    state={state}
                    onChangeImage={handleChangeImage}
                    onUpdate={(next, edited) => setState({ ...state, cards: next, edited })}
                    onSubmit={strategy => handleSubmit(strategy)}
                />
            )}

            {state.kind === 'submitting' && (
                <div className="rounded-md border border-border bg-accent-soft/30 px-4 py-8 text-sm text-center text-muted-foreground inline-flex flex-col items-center gap-2 w-full">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    등록 중...
                </div>
            )}
        </div>
    )
}

function ReviewCardList({
    state,
    onChangeImage,
    onUpdate,
    onSubmit,
}: {
    state: Extract<ImageModeState, { kind: 'review' }>
    onChangeImage: () => void
    onUpdate: (next: ReviewCard[], edited: boolean) => void
    onSubmit: (strategy: 'overwrite' | 'add') => void
}) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const [strategy, setStrategy] = useState<'overwrite' | 'add'>('overwrite')

    const updateCard = (id: string, patch: Partial<ReviewCard>) => {
        const next = state.cards.map(c => (c.id === id ? { ...c, ...patch } : c))
        onUpdate(next, true)
    }

    const removeCard = (id: string) => {
        const next = state.cards.filter(c => c.id !== id)
        onUpdate(next, true)
    }

    const total = state.cards.length
    const ready = state.cards.filter(c => c.selected && c.draft.stockCode).length

    return (
        <div className="space-y-3">
            {/* 이미지 썸네일 + 변경 버튼 */}
            <div className="flex items-center gap-3 rounded-md border border-border bg-background p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={state.previewUrl}
                    alt={tx.ocrThumbnailAlt}
                    width={56}
                    height={56}
                    className="w-14 h-14 object-cover rounded border border-border shrink-0"
                />
                <div className="flex-1 text-[11px] text-muted-foreground">
                    {tx.ocrCountSummary
                        .replace('{total}', String(total))
                        .replace('{ready}', String(ready))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onChangeImage}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    {tx.ocrChangeImage}
                </Button>
            </div>

            {/* 카드 리스트 */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {state.cards.map(card => (
                    <ReviewCardItem
                        key={card.id}
                        card={card}
                        onChange={patch => updateCard(card.id, patch)}
                        onRemove={() => removeCard(card.id)}
                    />
                ))}
            </div>

            {/* 전략 선택 */}
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

            <Button
                type="button"
                onClick={() => onSubmit(strategy)}
                disabled={ready === 0}
                className="w-full"
            >
                {tx.ocrSubmitButton.replace('{count}', String(ready))}
            </Button>
        </div>
    )
}

function ReviewCardItem({
    card,
    onChange,
    onRemove,
}: {
    card: ReviewCard
    onChange: (patch: Partial<ReviewCard>) => void
    onRemove: () => void
}) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage

    const isResolved = !!card.draft.stockCode
    const isAmbiguousOrUnresolved = !isResolved
    const isUSD = card.draft.currency === 'USD'

    return (
        <div
            className={cn(
                'rounded-md border p-3 space-y-2',
                isResolved
                    ? 'border-border bg-background'
                    : 'border-amber-500/50 bg-amber-500/5',
            )}
        >
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={card.selected}
                    onChange={e => onChange({ selected: e.target.checked })}
                    disabled={!isResolved}
                    className="w-4 h-4"
                    aria-label="등록 대상 선택"
                />
                <div className="flex-1 min-w-0">
                    {isResolved ? (
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm truncate">{card.draft.stockName}</span>
                            <span className="text-[10px] text-muted-foreground">{card.draft.stockCode}</span>
                            {isUSD && (
                                <span className="text-[10px] bg-accent-soft px-1.5 py-0.5 rounded">USD</span>
                            )}
                            {card.replaced && (
                                <span className="text-[10px] text-amber-600">교체됨</span>
                            )}
                        </div>
                    ) : (
                        <div className="text-[11px] text-amber-700">
                            {tx.ocrUnresolvedHint} (원문: &quot;{card.analyzed.identifier}&quot;)
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="카드 제거"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* 종목 검색 콤보 — 모호/실패 시 보임 */}
            {isAmbiguousOrUnresolved && (
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
                                currency:
                                    stock.market === 'KOSPI' || stock.market === 'KOSDAQ' ? 'KRW' : 'USD',
                            },
                            selected: true,
                            replaced: true,
                        })
                    }}
                />
            )}

            {/* 수량 / 평단가 inline edit */}
            <div className={cn('grid gap-2', isUSD ? 'grid-cols-3' : 'grid-cols-2')}>
                <label className="text-[11px]">
                    <div className="text-muted-foreground mb-0.5">{tx.quantity}</div>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={card.draft.quantity}
                        onChange={e => {
                            const raw = e.target.value
                            // 빈 입력 / NaN 은 일시적이므로 draft 보존. 사용자가 새 값을 칠 때까지 기존 값 유지.
                            if (raw === '') return
                            const num = Number(raw)
                            if (!Number.isFinite(num) || num < 0) return
                            onChange({
                                draft: { ...card.draft, quantity: Math.trunc(num) },
                            })
                        }}
                        className="w-full border border-input bg-background rounded-sm h-8 px-2 text-sm"
                    />
                </label>
                <label className="text-[11px]">
                    <div className="text-muted-foreground mb-0.5">{tx.averagePrice}</div>
                    <input
                        type="number"
                        min={0}
                        step={0.0001}
                        value={card.draft.averagePrice}
                        onChange={e => {
                            const raw = e.target.value
                            if (raw === '') return
                            const num = Number(raw)
                            if (!Number.isFinite(num) || num < 0) return
                            onChange({
                                draft: { ...card.draft, averagePrice: num },
                            })
                        }}
                        className="w-full border border-input bg-background rounded-sm h-8 px-2 text-sm"
                    />
                </label>
                {isUSD && (
                    <label className="text-[11px]">
                        <div className="text-muted-foreground mb-0.5">환율</div>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={card.draft.purchaseRate ?? card.draft.effectiveRate ?? ''}
                            onChange={e => {
                                const raw = e.target.value
                                if (raw === '') return
                                const num = Number(raw)
                                if (!Number.isFinite(num) || num < 0) return
                                onChange({
                                    draft: { ...card.draft, purchaseRate: num },
                                })
                            }}
                            className="w-full border border-input bg-background rounded-sm h-8 px-2 text-sm"
                        />
                    </label>
                )}
            </div>
        </div>
    )
}
