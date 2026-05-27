'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
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
 * 이미지를 canvas 로 압축해 OCR 페이로드용 base64(prefix 없음)와
 * 화면 표시용 작은 previewUrl(dataURL, 320px) 을 함께 반환한다.
 *
 * 1차: maxWidth 1920, maxHeight 4096, quality 0.92 → 2차(>4MB): 1280×2560, 0.88.
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

        // 4MB 초과면 2차 압축: maxWidth 1280, maxHeight 2560
        if (result.bytes > TARGET_BASE64_BYTES) {
            result = tryEncode(1280, 2560, 0.88)
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

            setState({ kind: 'review', previewUrl, resolved, unresolved, edited: false })
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
