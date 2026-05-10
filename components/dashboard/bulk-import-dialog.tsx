'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Upload, AlertCircle, CheckCircle2 } from 'lucide-react'
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

const RECENT_ACCOUNT_KEY = 'snapshot.bulkImport.lastAccountId'
const MAX_ITEMS = 100

interface BulkImportDialogProps {
    children?: React.ReactNode
    onSuccess?: () => void
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

export function BulkImportDialog({ children, onSuccess }: BulkImportDialogProps) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const router = useRouter()
    const [, startTransition] = useTransition()

    const [open, setOpen] = useState(false)
    const [rawText, setRawText] = useState('')
    const [strategy, setStrategy] = useState<'overwrite' | 'add'>('add')
    const [accounts, setAccounts] = useState<BrokerageAccountSummary[]>([])
    const [accountId, setAccountId] = useState<string>('')
    const [accountsLoading, setAccountsLoading] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const [executing, setExecuting] = useState(false)
    const [resolved, setResolved] = useState<AnalyzedItem[]>([])
    const [unresolved, setUnresolved] = useState<AnalyzedItem[]>([])
    const [hasAnalyzed, setHasAnalyzed] = useState(false)

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

    const parsedItems = useMemo<ImportItem[]>(() => {
        return rawText
            .split('\n')
            .map(parseLine)
            .filter((x): x is ImportItem => x !== null)
    }, [rawText])

    const reset = () => {
        setRawText('')
        setResolved([])
        setUnresolved([])
        setHasAnalyzed(false)
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
            setResolved(res.resolved)
            setUnresolved(res.unresolved)
            setHasAnalyzed(true)
        } catch {
            toast.error(tx.parsingFailedDesc)
        } finally {
            setAnalyzing(false)
        }
    }

    const handleExecute = async () => {
        if (resolved.length === 0) {
            toast.error(tx.nothingToImportDesc)
            return
        }
        if (!accountId) {
            toast.error(tx.accountRequired)
            return
        }
        setExecuting(true)
        try {
            // 서버 액션에는 stockCode(=identifier) 기반으로 보낸다 — analyze 가 채워준 stockCode 로 교체.
            const payload = resolved.map(r => ({
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
            if (res.success) {
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
            } else {
                toast.error(res.error ?? tx.importFailed)
            }
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
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{tx.title}</DialogTitle>
                    <DialogDescription>{tx.desc}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* 계좌 셀렉터 */}
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
                                    setResolved([])
                                    setUnresolved([])
                                }
                            }}
                            disabled={isBusy}
                            placeholder={tx.pastePlaceholder}
                            rows={6}
                            className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                        />
                        <div className="mt-1 text-[11px] text-muted-foreground">
                            {parsedItems.length > 0
                                ? language === 'ko'
                                    ? `${parsedItems.length}개 라인 인식됨`
                                    : `${parsedItems.length} lines detected`
                                : ' '}
                        </div>
                    </div>

                    {/* 전략 */}
                    <div>
                        <label className="block text-[11px] font-bold tracking-wide text-muted-foreground mb-1.5 uppercase">
                            {tx.strategy}
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                type="button"
                                onClick={() => setStrategy('add')}
                                disabled={isBusy}
                                className={cn(
                                    'py-2 text-[12px] font-bold rounded-sm border transition-colors',
                                    strategy === 'add'
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-foreground border-border hover:bg-accent-soft',
                                )}
                            >
                                {tx.strategyAdd}
                            </button>
                            <button
                                type="button"
                                onClick={() => setStrategy('overwrite')}
                                disabled={isBusy}
                                className={cn(
                                    'py-2 text-[12px] font-bold rounded-sm border transition-colors',
                                    strategy === 'overwrite'
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-foreground border-border hover:bg-accent-soft',
                                )}
                            >
                                {tx.strategyOverwrite}
                            </button>
                        </div>
                    </div>

                    {/* 분석 버튼 */}
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

                    {/* 미리보기 */}
                    {hasAnalyzed && (
                        <div className="border border-border rounded-md overflow-hidden">
                            <div className="px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-bold tracking-wide text-muted-foreground uppercase flex items-center gap-2">
                                {tx.analysisResult}
                                <span className="text-foreground numeric">{resolved.length}</span>
                                {unresolved.length > 0 && (
                                    <span className="text-destructive numeric">/ {unresolved.length} {tx.failed}</span>
                                )}
                            </div>

                            {/* 미해결 목록 */}
                            {unresolved.length > 0 && (
                                <div className="border-b border-border bg-destructive/5 px-3 py-2 space-y-1">
                                    <div className="text-[11px] font-bold text-destructive flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        {tx.tabUnresolved.replace('{count}', String(unresolved.length))}
                                    </div>
                                    {unresolved.map((u, i) => (
                                        <div key={`u-${i}`} className="text-[11px] text-foreground/80 numeric font-mono">
                                            {u.identifier} · {u.inputQty} · {u.inputPrice}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 해결 목록 */}
                            {resolved.length > 0 && (
                                <div className="max-h-[240px] overflow-y-auto">
                                    {resolved.map((r, i) => (
                                        <div
                                            key={`r-${i}`}
                                            className="px-3 py-2 border-b border-border last:border-b-0 flex items-start justify-between gap-3"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[12px] font-semibold text-foreground truncate">
                                                    <CheckCircle2 className="w-3 h-3 inline-block mr-1 text-profit" />
                                                    {r.stockName ?? r.identifier}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground numeric font-mono mt-0.5">
                                                    {r.stockCode} · {r.currency}
                                                    {r.currentQty > 0 && (
                                                        <span className="ml-1">
                                                            · {tx.currentQty} {r.currentQty}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-[12px] font-bold text-foreground numeric">
                                                    {r.inputQty} × {r.inputPrice.toLocaleString()}
                                                </div>
                                                {r.currency === 'USD' && r.effectiveRate ? (
                                                    <div className="text-[10px] text-muted-foreground numeric mt-0.5">
                                                        {tx.rate} ₩{r.effectiveRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                        {r.rateAutoFilled && (
                                                            <span className="ml-1 inline-flex items-center px-1 py-px text-[9px] font-bold bg-accent-soft text-foreground rounded-sm">
                                                                {tx.rateAutoFilled}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {resolved.length === 0 && unresolved.length === 0 && (
                                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                                    {tx.noReady}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 실행 버튼 */}
                    <Button
                        type="button"
                        onClick={handleExecute}
                        disabled={isBusy || !hasAnalyzed || resolved.length === 0 || !accountId || noAccounts}
                        className="w-full"
                    >
                        {executing
                            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />...</>
                            : tx.executeImport}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
