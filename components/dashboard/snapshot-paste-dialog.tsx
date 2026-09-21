'use client'

import { useState, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, ClipboardPaste } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'
import { analyzeBulkImport, type ImportItem } from '@/app/actions/admin-actions'
import { parsePastedTable, derivePurchaseRate, type PastedRow } from '@/lib/utils/paste-table'

const MAX_ITEMS = 100

/** 부모(스냅샷 작성 폼)가 행으로 변환해 넣을 수 있는 최소 정보. */
export type ResolvedPastedHolding = {
    stockCode: string
    stockName: string
    market: string
    currency: 'KRW' | 'USD'
    quantity: number
    averagePrice: number
    /** 시트에 현재가가 있었으면 그 값. 없으면 undefined → 스냅샷 날짜로 조회. */
    currentPrice?: number
    /** 투자금액에서 역산한 매입환율. 없으면 undefined → 스냅샷 시점 환율 사용. */
    purchaseRate?: number
}

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    onApply: (rows: ResolvedPastedHolding[]) => void
}

const SAMPLE_KO = `종목명\t종목코드\t평균매수단가\t보유수량\t현재가\t투자금액
애플\tAAPL\t183.72\t1\t336.13\t241,353
LG디스플레이\t034220\t24,000\t2\t8,400\t48,000`

export function SnapshotPasteDialog({ open, onOpenChange, onApply }: Props) {
    const { language } = useLanguage()
    const ko = language === 'ko'
    const [text, setText] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [unresolved, setUnresolved] = useState<string[]>([])
    const [pending, startTransition] = useTransition()

    function reset() {
        setText('')
        setError(null)
        setUnresolved([])
    }

    function handleSubmit() {
        setError(null)
        setUnresolved([])

        const parsed = parsePastedTable(text)

        if (parsed.error === 'EMPTY') {
            setError(ko ? '붙여넣은 내용이 없습니다.' : 'Nothing pasted.')
            return
        }
        if (parsed.error === 'NO_HEADER') {
            setError(ko
                ? '헤더를 찾지 못했습니다. 종목명·종목코드·평균매수단가·보유수량이 들어있는 헤더행까지 함께 복사해 주세요.'
                : 'Header row not found. Include the header row with name, code, average price and quantity.')
            return
        }
        if (parsed.rows.length === 0) {
            setError(ko ? '인식된 종목이 없습니다.' : 'No holdings recognized.')
            return
        }
        if (parsed.rows.length > MAX_ITEMS) {
            setError(ko
                ? `한 번에 최대 ${MAX_ITEMS}개까지 넣을 수 있습니다. (인식 ${parsed.rows.length}개)`
                : `Up to ${MAX_ITEMS} holdings at a time (got ${parsed.rows.length}).`)
            return
        }

        // 역산 매입환율을 함께 넘겨 analyzeBulkImport 가 통화/환율 판단에 쓰게 한다.
        const byIdentifier = new Map<string, PastedRow>()
        const items: ImportItem[] = parsed.rows.map((row) => {
            byIdentifier.set(row.identifier, row)
            const rate = derivePurchaseRate(row)
            return {
                identifier: row.identifier,
                quantity: row.quantity,
                averagePrice: row.averagePrice,
                ...(rate !== null ? { purchaseRate: rate } : {}),
            }
        })

        startTransition(async () => {
            const result = await analyzeBulkImport(items)
            if (!result.success) {
                setError(result.error || (ko ? '종목 조회에 실패했습니다.' : 'Failed to resolve stocks.'))
                return
            }

            const rows: ResolvedPastedHolding[] = []
            for (const item of result.resolved) {
                if (!item.stockCode) continue
                const src = byIdentifier.get(item.identifier)
                rows.push({
                    stockCode: item.stockCode,
                    stockName: item.stockName || src?.stockName || item.stockCode,
                    market: item.market || '',
                    currency: item.currency === 'USD' ? 'USD' : 'KRW',
                    quantity: item.inputQty,
                    averagePrice: item.inputPrice,
                    ...(src?.currentPrice !== undefined ? { currentPrice: src.currentPrice } : {}),
                    ...(item.inputRate !== undefined ? { purchaseRate: item.inputRate } : {}),
                })
            }

            if (rows.length === 0) {
                setError(ko ? '매칭된 종목이 없습니다.' : 'No stocks matched.')
                setUnresolved(result.unresolved.map((u) => u.identifier))
                return
            }

            // 매칭 실패는 알리되, 성공분은 그대로 반영한다(전부 막으면 다시 붙여넣어야 한다).
            if (result.unresolved.length > 0) {
                setUnresolved(result.unresolved.map((u) => u.identifier))
            }

            onApply(rows)
            reset()
            onOpenChange(false)
        })
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) reset()
                onOpenChange(next)
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{ko ? '스프레드시트에서 붙여넣기' : 'Paste from spreadsheet'}</DialogTitle>
                    <DialogDescription>
                        {ko
                            ? '헤더행을 포함해 복사하면 열 이름을 알아서 맞춥니다. 현금·합계행은 자동으로 걸러집니다.'
                            : 'Copy including the header row — columns are matched by name. Cash and total rows are skipped.'}
                    </DialogDescription>
                </DialogHeader>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={SAMPLE_KO}
                    spellCheck={false}
                    rows={10}
                    className="w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />

                <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
                    {ko
                        ? '인식 열: 종목명 · 종목코드 · 평균매수단가 · 보유수량 · 현재가 · 투자금액. 투자금액이 있으면 미국 종목의 매입환율을 역산합니다.'
                        : 'Columns: name · code · average price · quantity · price · cost. Cost is used to derive the purchase FX rate for US holdings.'}
                </p>

                {error && (
                    <p className="text-[0.75rem] text-destructive">{error}</p>
                )}
                {unresolved.length > 0 && (
                    <p className="text-[0.75rem] text-muted-foreground">
                        {ko ? '매칭 실패: ' : 'Not matched: '}
                        {unresolved.join(', ')}
                    </p>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                        {ko ? '취소' : 'Cancel'}
                    </Button>
                    <Button type="button" onClick={handleSubmit} disabled={pending || !text.trim()}>
                        {pending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <><ClipboardPaste className="mr-1.5 h-4 w-4" />{ko ? '종목 채우기' : 'Fill holdings'}</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
