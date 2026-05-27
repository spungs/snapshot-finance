'use client'

import { useState, useRef, useCallback } from 'react'
import { Loader2, Upload, AlertCircle, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { cn } from '@/lib/utils'
import type { AnalyzedItem } from '@/app/actions/admin-actions'

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_RAW_BYTES = 10 * 1024 * 1024 // 10MB
const TARGET_BASE64_BYTES = 4 * 1024 * 1024 // 4MB (서버 한계와 정합)

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
    | { kind: 'review'; previewUrl: string; resolved: AnalyzedItem[]; unresolved: AnalyzedItem[]; edited: boolean }
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
 * 이미지를 canvas 로 압축해 base64 로 반환한다.
 * 1차: maxWidth 1920 / quality 0.92 → 2차(>4MB): maxWidth 1280 / quality 0.88.
 *
 * 결과: { dataUrl: "data:image/jpeg;base64,...", mimeType, bytes }.
 * 실패 시 throw — 호출부에서 toast.
 */
async function compressImage(file: File): Promise<{ dataUrl: string; mimeType: string; bytes: number }> {
    const objectUrl = URL.createObjectURL(file)
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image()
            el.onload = () => resolve(el)
            el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
            el.src = objectUrl
        })

        const tryEncode = (maxWidth: number, quality: number): { dataUrl: string; bytes: number } => {
            const scale = Math.min(1, maxWidth / img.naturalWidth)
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

        // 1차 압축
        let { dataUrl, bytes } = tryEncode(1920, 0.92)

        // 4MB 초과면 2차 압축
        if (bytes > TARGET_BASE64_BYTES) {
            ({ dataUrl, bytes } = tryEncode(1280, 0.88))
        }

        if (bytes > TARGET_BASE64_BYTES) {
            throw new Error('이미지 압축 후에도 크기가 너무 큽니다.')
        }

        return { dataUrl, mimeType: 'image/jpeg', bytes }
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

export function BulkImportImageMode({ accountId, onSubmit, resetSignal }: BulkImportImageModeProps) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [state, setState] = useState<ImageModeState>({ kind: 'idle' })

    // 부모가 reset 요청 시(다이얼로그 close 등) idle 로 복귀.
    // resetSignal 이 바뀔 때만 trigger.
    const prevResetRef = useRef(resetSignal)
    if (prevResetRef.current !== resetSignal) {
        prevResetRef.current = resetSignal
        if (state.kind !== 'idle') {
            // preview URL 정리는 다음 unmount 또는 새 파일 선택 시 처리되므로 단순 상태 리셋.
            setState({ kind: 'idle' })
        }
    }

    const handleFile = useCallback(async (file: File) => {
        // mimeType 1차 검증
        if (!ACCEPTED_MIME_TYPES.includes(file.type as typeof ACCEPTED_MIME_TYPES[number])) {
            toast.error(tx.ocrUnsupportedFormat)
            return
        }
        if (file.size > MAX_RAW_BYTES) {
            toast.error(tx.ocrTooLarge)
            return
        }

        let compressed: { dataUrl: string; mimeType: string }
        try {
            compressed = await compressImage(file)
        } catch (e) {
            console.error('[bulk-import-image-mode] compress failed:', e)
            toast.error(tx.ocrCompressFailed)
            return
        }

        const previewUrl = compressed.dataUrl
        setState({ kind: 'analyzing', previewUrl })

        try {
            const res = await fetch('/api/ai/ocr-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: compressed.dataUrl,
                    mimeType: compressed.mimeType,
                }),
            })
            const body = (await res.json()) as OcrResponseBody

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

            setState({ kind: 'review', previewUrl, resolved, unresolved, edited: false })
        } catch (e) {
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
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!accountId}
                    className={cn(
                        'w-full rounded-md border border-dashed border-primary/60 bg-accent-soft/30',
                        'px-4 py-8 text-sm text-center text-muted-foreground',
                        'hover:bg-accent-soft/50 transition-colors disabled:opacity-50',
                    )}
                >
                    <Upload className="w-5 h-5 mx-auto mb-2 opacity-70" />
                    {tx.ocrUploadHint}
                </button>
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

            {/* review / submitting 상태의 UI 는 Task 6, 7 에서 추가 */}

            {/* TODO(Task 7): submitting 처리, onSubmit 호출, 이미지 변경 confirm */}
            {(state.kind === 'review' || state.kind === 'submitting') && (
                <ReviewPlaceholder
                    state={state}
                    onChangeImage={handleChangeImage}
                />
            )}
        </div>
    )
}

// Task 6 에서 정식 구현으로 교체. 지금은 분석 결과를 단순 텍스트로 노출해 흐름이 정상인지 확인.
function ReviewPlaceholder({
    state,
    onChangeImage,
}: {
    state: Extract<ImageModeState, { kind: 'review' | 'submitting' }>
    onChangeImage: () => void
}) {
    return (
        <div className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={state.previewUrl}
                    alt="upload preview"
                    className="w-20 h-20 object-cover rounded-md border border-border shrink-0"
                />
                <div className="flex-1 text-xs space-y-1">
                    <div className="font-bold">분석 결과 (Task 6 에서 카드로 교체)</div>
                    <div>resolved: {state.resolved.length}개</div>
                    <div>unresolved: {state.unresolved.length}개</div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={onChangeImage}>
                    <X className="w-3.5 h-3.5" />
                </Button>
            </div>
        </div>
    )
}
