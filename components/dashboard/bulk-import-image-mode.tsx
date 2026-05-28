'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Loader2, Upload, AlertCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { cn } from '@/lib/utils'
import type { AnalyzedItem } from '@/app/actions/admin-actions'
import { ReviewList, buildInitialCards, type ReviewCard } from './review-list'

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_RAW_BYTES = 5 * 1024 * 1024 // 5MB (일반 캡쳐는 1~2MB 수준 — 보수적 상한)
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
            const detected = body.detected ?? 0

            if (resolved.length === 0 && unresolved.length === 0) {
                // detected > 0 면 OCR 은 종목을 봤지만 모두 validator 탈락 — 평단가 누락 가능성 높음.
                const msg = detected > 0 ? tx.ocrEmptyAfterFilter : tx.ocrEmptyResult
                setState({ kind: 'error', previewUrl, message: msg })
                toast.warning(msg)
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
                .filter(c => c.selected && c.draft.stockCode && c.draft.averagePrice > 0)
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
                <ReviewList
                    cards={state.cards}
                    onUpdate={(next, edited) => setState({ ...state, cards: next, edited })}
                    onSubmit={strategy => handleSubmit(strategy)}
                    imageHeader={{ previewUrl: state.previewUrl, onChangeImage: handleChangeImage }}
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

