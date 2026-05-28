'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Upload, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { cn } from '@/lib/utils'
import {
    analyzeBulkImport,
    executeBulkImport,
    listBrokerageAccountsForBulkImport,
    type AnalyzedItem,
    type BrokerageAccountSummary,
    type ImportItem,
} from '@/app/actions/admin-actions'
import { BulkImportImageMode } from './bulk-import-image-mode'
import { ReviewList, buildInitialCards, type ReviewCard } from './review-list'

const RECENT_ACCOUNT_KEY = 'snapshot.bulkImport.lastAccountId'
const MAX_ITEMS = 100

interface BulkImportDialogProps {
    children?: React.ReactNode
    onSuccess?: () => void
    isPro?: boolean
}

/**
 * 한 줄을 토큰으로 분해 → ImportItem 으로 변환.
 *
 *   [종목] [수량] [평단가] [환율?]
 *
 * - 4번째 토큰(환율)은 옵셔널.
 * - 종목 토큰 자체에 공백이 들어갈 수 있는 한국어 종목명("LG 디스플레이")은
 *   기존 동작과 호환되도록 마지막 2~3개 토큰을 수치로 본 뒤 앞부분을 종목명으로 합친다.
 */
function parseLine(rawLine: string): ImportItem | null {
    const line = rawLine.trim()
    if (!line) return null
    // 콤마/탭/멀티공백을 모두 단일 공백으로 정규화
    const tokens = line.split(/[\s,\t]+/).filter(Boolean)
    if (tokens.length < 3) return null

    const tryParseNum = (s: string): number | null => {
        const cleaned = s.replace(/,/g, '')
        const n = parseFloat(cleaned)
        return Number.isFinite(n) ? n : null
    }

    // 끝에서부터 환율(옵셔널) → 평단가 → 수량 → 나머지는 종목명
    let cursor = tokens.length - 1
    const last = tryParseNum(tokens[cursor])
    if (last === null) return null

    let rate: number | undefined
    let avg: number

    // 4토큰 이상이면서 마지막 토큰이 숫자고 그 앞도 숫자면 마지막을 환율로 본다.
    if (tokens.length >= 4) {
        const prev = tryParseNum(tokens[cursor - 1])
        if (prev !== null) {
            rate = last
            avg = prev
            cursor -= 2
        } else {
            avg = last
            cursor -= 1
        }
    } else {
        avg = last
        cursor -= 1
    }

    const qty = tryParseNum(tokens[cursor])
    if (qty === null) return null
    cursor -= 1

    if (cursor < 0) return null
    const identifier = tokens.slice(0, cursor + 1).join(' ').trim()
    if (!identifier) return null

    return {
        identifier,
        quantity: Math.trunc(qty),
        averagePrice: avg,
        ...(typeof rate === 'number' && rate > 0 ? { purchaseRate: rate } : {}),
    }
}

type LineResult =
    | { kind: 'parsed'; lineNo: number; raw: string; item: ImportItem }
    | { kind: 'skipped'; lineNo: number; raw: string; reason: 'header' | 'total' }
    | { kind: 'error'; lineNo: number; raw: string }

/**
 * 합계/소계/총계 등 요약 행 키워드. 이런 행은 종목이 아니므로 스킵.
 */
const TOTAL_ROW_PATTERN = /합계|총계|소계|총합|합산|평가금액\s*합|\btotal\b|\bsum\b/i

/**
 * 한 줄을 분류한다.
 * - 빈 줄: null 반환 (호출부에서 제외, 카운트 안 함)
 * - 합계/총계 키워드: skipped(total)
 * - 숫자 토큰이 전혀 없음(헤더 추정): skipped(header)
 * - parseLine 성공: parsed
 * - 그 외: error (형식 오류)
 */
function classifyLine(raw: string, lineNo: number): LineResult | null {
    const line = raw.trim()
    if (!line) return null

    if (TOTAL_ROW_PATTERN.test(line)) {
        return { kind: 'skipped', lineNo, raw: line, reason: 'total' }
    }

    // 숫자 토큰 존재 여부 — 수량/평단가는 숫자 필수. 숫자 0개면 헤더 행으로 추정.
    const tokens = line.split(/[\s,\t]+/).filter(Boolean)
    const hasNumber = tokens.some(t => {
        const cleaned = t.replace(/[,주원$₩]/g, '')
        return cleaned !== '' && /\d/.test(cleaned) && Number.isFinite(parseFloat(cleaned))
    })
    if (!hasNumber) {
        return { kind: 'skipped', lineNo, raw: line, reason: 'header' }
    }

    const item = parseLine(raw)
    if (item) return { kind: 'parsed', lineNo, raw: line, item }
    return { kind: 'error', lineNo, raw: line }
}

export function BulkImportDialog({ children, onSuccess, isPro = false }: BulkImportDialogProps) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const router = useRouter()
    const [, startTransition] = useTransition()

    const [open, setOpen] = useState(false)
    const [rawText, setRawText] = useState('')
    const [accounts, setAccounts] = useState<BrokerageAccountSummary[]>([])
    const [accountId, setAccountId] = useState<string>('')
    const [accountsLoading, setAccountsLoading] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const [executing, setExecuting] = useState(false)
    const [cards, setCards] = useState<ReviewCard[]>([])
    const [hasAnalyzed, setHasAnalyzed] = useState(false)
    const [mode, setMode] = useState<'text' | 'image'>('text') // 디폴트: 텍스트 (자물쇠 첫 화면 노출 방지)
    const [imageResetSignal, setImageResetSignal] = useState(0)

    // 모달 열릴 때 계좌 목록 로드 + 최근 사용 계좌 복원
    useEffect(() => {
        if (!open) return
        let cancelled = false
        setAccountsLoading(true)
        listBrokerageAccountsForBulkImport()
            .then(res => {
                if (cancelled) return
                if (res.success) {
                    setAccounts(res.accounts)
                    let nextId = ''
                    try {
                        const saved = localStorage.getItem(RECENT_ACCOUNT_KEY)
                        if (saved && res.accounts.some(a => a.id === saved)) {
                            nextId = saved
                        }
                    } catch { /* localStorage 접근 불가 */ }
                    if (!nextId && res.accounts.length > 0) {
                        nextId = res.accounts[0].id
                    }
                    setAccountId(nextId)
                } else {
                    toast.error(res.error ?? tx.parsingFailedDesc)
                }
            })
            .finally(() => {
                if (!cancelled) setAccountsLoading(false)
            })
        return () => { cancelled = true }
        // tx 는 language 따라 바뀌지만 모달 lifecycle 의존성으로는 open 만 의미 있음
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const lineResults = useMemo<LineResult[]>(() => {
        return rawText
            .split('\n')
            .map((raw, i) => classifyLine(raw, i + 1))
            .filter((r): r is LineResult => r !== null)
    }, [rawText])

    const parsedItems = useMemo<ImportItem[]>(
        () => lineResults.filter(r => r.kind === 'parsed').map(r => r.item),
        [lineResults],
    )

    const skippedCount = useMemo(
        () => lineResults.filter(r => r.kind === 'skipped').length,
        [lineResults],
    )

    const errorLines = useMemo(
        () => lineResults.filter((r): r is Extract<LineResult, { kind: 'error' }> => r.kind === 'error'),
        [lineResults],
    )

    const reset = () => {
        setRawText('')
        setCards([])
        setHasAnalyzed(false)
        setMode('text')
        setImageResetSignal(s => s + 1)
    }

    const handleClear = () => reset()

    const handleAnalyze = async () => {
        if (parsedItems.length === 0) {
            toast.error(tx.nothingToImportDesc)
            return
        }
        if (parsedItems.length > MAX_ITEMS) {
            toast.error(tx.tooManyItems.replace('{max}', String(MAX_ITEMS)))
            return
        }
        setAnalyzing(true)
        try {
            const res = await analyzeBulkImport(parsedItems)
            if (!res.success) {
                toast.error(res.error ?? tx.parsingFailedDesc)
                return
            }
            setCards(buildInitialCards(res.resolved, res.unresolved))
            setHasAnalyzed(true)
        } catch {
            toast.error(tx.parsingFailedDesc)
        } finally {
            setAnalyzing(false)
        }
    }

    /**
     * 텍스트·이미지 모드 공통 import 실행 흐름.
     * - payload 매핑 → executeBulkImport → 성공 시 토스트/close/reset/refresh
     * - 실패 시 ok:false 반환 (호출부가 setExecuting 토글 / throw 분기 결정)
     */
    const runImport = async (
        items: AnalyzedItem[],
        strategy: 'overwrite' | 'add',
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
        if (!accountId) {
            toast.error(tx.accountRequired)
            return { ok: false, error: tx.accountRequired }
        }
        // 서버 액션에는 stockCode(=identifier) 기반으로 보낸다 — analyze 가 채워준 stockCode 로 교체.
        const payload = items.map(r => ({
            identifier: r.stockCode ?? r.identifier,
            quantity: r.inputQty,
            averagePrice: r.inputPrice,
            ...(typeof r.inputRate === 'number' && r.inputRate > 0
                ? { purchaseRate: r.inputRate }
                : typeof r.effectiveRate === 'number' && r.effectiveRate > 0
                    ? { purchaseRate: r.effectiveRate }
                    : {}),
        }))
        const res = await executeBulkImport(payload, strategy, accountId)
        if (!res.success) {
            const error = res.error ?? tx.importFailed
            toast.error(error)
            return { ok: false, error }
        }

        try {
            localStorage.setItem(RECENT_ACCOUNT_KEY, accountId)
        } catch { /* ignore */ }
        toast.success(tx.importSuccessDesc.replace('{count}', String(res.count ?? payload.length)))
        if (res.errors && res.errors.length > 0) {
            toast.warning(`${tx.importPartial}: ${res.errors.length}`)
        }
        setOpen(false)
        reset()
        onSuccess?.()
        startTransition(() => router.refresh())
        // 외부 client (portfolio-client) 의 holdings 자동 갱신
        try { window.dispatchEvent(new Event('portfolio:refresh')) } catch { /* ignore */ }
        return { ok: true }
    }

    const handleExecute = async (strategy: 'overwrite' | 'add') => {
        const validCards = cards.filter(c => c.selected && c.draft.stockCode && c.draft.averagePrice > 0)
        if (validCards.length === 0) {
            toast.error(tx.nothingToImportDesc)
            return
        }
        setExecuting(true)
        try {
            // ReviewCard → AnalyzedItem 형태로 변환 후 runImport 사용.
            const items: AnalyzedItem[] = validCards.map(c => ({
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
            await runImport(items, strategy)
        } catch {
            toast.error(tx.importFailed)
        } finally {
            setExecuting(false)
        }
    }

    const isBusy = analyzing || executing
    const showAccountSelector = accounts.length > 1
    const noAccounts = !accountsLoading && accounts.length === 0

    return (
        <Dialog open={open} onOpenChange={(next) => {
            if (!next) reset()
            setOpen(next)
        }}>
            <DialogTrigger asChild>
                {children ?? (
                    <Button type="button" variant="outline" size="sm">
                        <Upload className="w-4 h-4 mr-1.5" />
                        {tx.bulkImport}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[680px] lg:max-w-[900px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{tx.title}</DialogTitle>
                    <DialogDescription>{tx.desc}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* 모드 탭 */}
                    <div className="flex gap-1 border-b border-border">
                        <button
                            type="button"
                            onClick={() => {
                                if (!isPro) {
                                    toast(tx.ocrProOnly, { description: '곧 출시 예정이에요. 조금만 기다려주세요!' })
                                    return
                                }
                                setMode('image')
                            }}
                            className={cn(
                                'px-3 py-2 text-xs font-bold border-b-2 transition-colors inline-flex items-center gap-1',
                                mode === 'image' && isPro
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                            aria-label={isPro ? tx.ocrModeTab : `${tx.ocrModeTab} (PRO)`}
                        >
                            {tx.ocrModeTab}
                            {!isPro && (
                                <span className="text-[9px] bg-foreground text-background px-1 rounded">🔒</span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('text')}
                            className={cn(
                                'px-3 py-2 text-xs font-bold border-b-2 transition-colors',
                                mode === 'text'
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tx.textModeTab}
                        </button>
                    </div>

                    {/* 계좌 셀렉터 — 두 모드 공통 */}
                    {accountsLoading ? (
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> ...
                        </div>
                    ) : noAccounts ? (
                        <div className="border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-xs rounded-md inline-flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {tx.noAccounts}
                        </div>
                    ) : showAccountSelector ? (
                        <div>
                            <label className="block text-[11px] font-bold tracking-wide text-muted-foreground mb-1.5 uppercase">
                                {tx.accountSelector}
                            </label>
                            <select
                                value={accountId}
                                onChange={e => setAccountId(e.target.value)}
                                disabled={isBusy}
                                className="w-full border border-input bg-background rounded-md h-9 px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            >
                                {accounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                    ) : null}

                    {mode === 'text' ? (
                    <>
                    {/* 형식 안내 */}
                    <div className="border border-border bg-accent-soft/50 rounded-md p-3">
                        <div className="text-[11px] font-bold tracking-wide text-muted-foreground mb-1 uppercase">
                            {tx.formatInstructions}
                        </div>
                        <pre className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono">
                            {tx.formatDesc}
                        </pre>
                    </div>

                    {/* Raw 입력 */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                                {tx.rawData}
                            </label>
                            {rawText.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    disabled={isBusy}
                                    className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                                >
                                    {tx.clear}
                                </button>
                            )}
                        </div>
                        <textarea
                            value={rawText}
                            onChange={e => {
                                setRawText(e.target.value)
                                if (hasAnalyzed) {
                                    setHasAnalyzed(false)
                                    setCards([])
                                }
                            }}
                            disabled={isBusy}
                            placeholder={tx.pastePlaceholder}
                            rows={6}
                            className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                        />
                        <div className="mt-1 space-y-1">
                            {(parsedItems.length > 0 || skippedCount > 0 || errorLines.length > 0) && (
                                <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                                    <span className="text-foreground">{tx.linesRecognized.replace('{count}', String(parsedItems.length))}</span>
                                    {skippedCount > 0 && (
                                        <span>· {tx.linesSkipped.replace('{count}', String(skippedCount))}</span>
                                    )}
                                    {errorLines.length > 0 && (
                                        <span className="text-amber-600">· {tx.linesError.replace('{count}', String(errorLines.length))}</span>
                                    )}
                                </div>
                            )}
                            {errorLines.length > 0 && (
                                <ul className="text-[10px] text-amber-600/90 space-y-0.5">
                                    {errorLines.slice(0, 5).map(e => (
                                        <li key={e.lineNo} className="truncate">
                                            {tx.lineErrorDetail.replace('{line}', String(e.lineNo)).replace('{text}', e.raw)}
                                        </li>
                                    ))}
                                    {errorLines.length > 5 && (
                                        <li className="opacity-70">{tx.lineErrorMore.replace('{count}', String(errorLines.length - 5))}</li>
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* 분석 버튼 — 분석 전 또는 재분석 필요 시 노출. 분석 완료 후 ReviewList 가 등록 버튼을 가짐. */}
                    {!hasAnalyzed && (
                        <Button
                            type="button"
                            onClick={handleAnalyze}
                            disabled={isBusy || parsedItems.length === 0 || noAccounts}
                            className="w-full"
                            variant="secondary"
                        >
                            {analyzing
                                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />...</>
                                : tx.parsePreview}
                        </Button>
                    )}

                    {/* 분석 결과 — ReviewList 가 통합 표시·편집·등록 흐름을 담당 */}
                    {hasAnalyzed && cards.length > 0 && (
                        <ReviewList
                            cards={cards}
                            onUpdate={next => setCards(next)}
                            onSubmit={strategy => handleExecute(strategy)}
                        />
                    )}

                    {hasAnalyzed && cards.length === 0 && (
                        <div className="border border-border rounded-md px-3 py-6 text-center text-[12px] text-muted-foreground">
                            {tx.noReady}
                        </div>
                    )}

                    {executing && (
                        <div className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {tx.executeImport}
                        </div>
                    )}
                    </>
                    ) : (
                        <BulkImportImageMode
                            accountId={accountId}
                            resetSignal={imageResetSignal}
                            onSubmit={async (items, strategy) => {
                                // 이미지 모드 확정 — 텍스트 모드와 동일한 runImport 헬퍼 사용.
                                // 실패 시 throw 로 자식 컴포넌트에게 에러 전파.
                                const result = await runImport(items, strategy)
                                if (!result.ok) {
                                    throw new Error(result.error)
                                }
                            }}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
