'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { holdingsApi } from '@/lib/api/client'
import type { BrokerageAccountOption } from '@/components/dashboard/account-selector'

interface TransferHoldingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    holding: {
        id: string
        stockName: string
        quantity: number
        accountId?: string | null
        accountName?: string | null
    } | null
    accounts: BrokerageAccountOption[]
    onTransferred: () => void | Promise<void>
    language: 'ko' | 'en'
}

/**
 * 주식 이체 다이얼로그 — A 계좌 → B 계좌로 보유 종목 이동.
 * 부분 이체 지원, 대상 계좌에 동일 종목 있으면 서버에서 가중평균 merge.
 */
export function TransferHoldingDialog({
    open, onOpenChange,
    holding, accounts,
    onTransferred,
    language,
}: TransferHoldingDialogProps) {
    const [toAccountId, setToAccountId] = useState<string>('')
    const [qty, setQty] = useState<string>('')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (open && holding) {
            setQty(holding.quantity.toString())
            const candidates = accounts.filter(a => a.id !== holding.accountId)
            setToAccountId(candidates[0]?.id ?? '')
        }
    }, [open, holding, accounts])

    if (!holding) return null

    const candidates = accounts.filter(a => a.id !== holding.accountId)
    const transferQty = parseInt(qty.replace(/,/g, ''), 10)
    const maxQty = holding.quantity
    const isValid =
        !!toAccountId &&
        Number.isFinite(transferQty) &&
        transferQty > 0 &&
        transferQty <= maxQty

    const handleTransfer = async () => {
        if (!isValid || submitting) return
        setSubmitting(true)
        try {
            const res = await holdingsApi.transfer(holding.id, {
                toAccountId,
                quantity: transferQty,
            })
            if (res.success) {
                toast.success(
                    language === 'ko'
                        ? `${transferQty}주 이체 완료${res.data?.merged ? ' (기존 보유와 합산)' : ''}`
                        : `Transferred ${transferQty} shares${res.data?.merged ? ' (merged)' : ''}`
                )
                await onTransferred()
                onOpenChange(false)
            } else {
                toast.error(res.error?.message ?? (language === 'ko' ? '이체 실패' : 'Transfer failed'))
            }
        } catch {
            toast.error(language === 'ko' ? '네트워크 오류' : 'Network error')
        } finally {
            setSubmitting(false)
        }
    }

    const exceedsMax = Number.isFinite(transferQty) && transferQty > maxQty

    return (
        <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {language === 'ko' ? '주식 이체' : 'Transfer holding'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="text-sm space-y-1">
                        <div>
                            <span className="font-medium">{holding.stockName}</span>
                            <span className="ml-2 text-[12px] text-muted-foreground">
                                {language === 'ko' ? '보유' : 'Hold'} {holding.quantity}
                                {language === 'ko' ? '주' : ' shr'}
                            </span>
                        </div>
                        {holding.accountName && (
                            <div className="text-[12px] text-muted-foreground">
                                {language === 'ko' ? '보내는 계좌' : 'From'}: {holding.accountName}
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">
                            {language === 'ko' ? '받는 계좌' : 'To account'}
                        </label>
                        <Select
                            value={toAccountId}
                            onValueChange={setToAccountId}
                            disabled={submitting}
                        >
                            <SelectTrigger>
                                <SelectValue
                                    placeholder={language === 'ko' ? '계좌 선택' : 'Choose account'}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {candidates.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                        {acc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <FormattedNumberInput
                            label={
                                language === 'ko'
                                    ? `이체 수량 (최대 ${maxQty}주)`
                                    : `Quantity (max ${maxQty})`
                            }
                            value={qty}
                            onChange={setQty}
                            disabled={submitting}
                            suffix={language === 'ko' ? '주' : 'shr'}
                        />
                        {exceedsMax && (
                            <p className="text-xs text-destructive">
                                {language === 'ko'
                                    ? `보유 수량 ${maxQty}주를 초과할 수 없습니다.`
                                    : `Cannot exceed available ${maxQty} shares.`}
                            </p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleTransfer}
                        disabled={!isValid || submitting}
                        className="w-full bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 hover:opacity-90 rounded-md flex items-center justify-center gap-2"
                    >
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {language === 'ko' ? '이체' : 'Transfer'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
