'use client'

import { useState, useEffect, useTransition } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { updateCashAccounts } from "@/app/actions/cash-actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Edit2, Loader2 } from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"
import { Currency } from "@/lib/currency/context"
import { CashAccountEditor, type CashAccountRow, toEditorRows, fromEditorRows } from "./cash-account-editor"
import type { CashAccount } from "@/types/cash"

interface BrokerageAccountLite {
    id: string
    name: string
}

interface CashBalanceDialogProps {
    initialBalance: number
    initialAccounts?: CashAccount[] | null
    // 사용자가 계좌 관리에서 등록한 증권 계좌 목록 — 다이얼로그 열 때 라벨 자동 시드.
    brokerageAccounts?: BrokerageAccountLite[]
    currency?: Currency
    exchangeRate?: number
    children?: React.ReactNode
    onSuccess?: () => void
}

// 라벨 정규화: 대소문자 무시 + trim. BrokerageAccount.name 과 cashAccount.label 매칭에 사용.
function normalizeLabel(s: string): string {
    return s.trim().toLowerCase()
}

// 기존 단일 행 다이얼로그 → 계좌별 분해 편집으로 확장.
// initialAccounts 가 있으면 그대로 시드, 없으면 합계만 있는 1행으로 시드 (legacy 호환).
export function CashBalanceDialog({
    initialBalance,
    initialAccounts,
    brokerageAccounts,
    currency = 'KRW',
    exchangeRate = 1435,
    children,
    onSuccess,
}: CashBalanceDialogProps) {
    const { t, language } = useLanguage()
    const [open, setOpen] = useState(false)
    const [rows, setRows] = useState<CashAccountRow[]>([])
    const [loading, setLoading] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    useEffect(() => {
        if (!open) return

        const brokerage = brokerageAccounts ?? []
        const stored = initialAccounts ?? []

        // BrokerageAccount 가 있으면 그 순서대로 행을 만들고, 라벨이 매칭되는 기존 cashAccount 의 금액을 채운다.
        // 매칭 안 되는 cashAccount (사용자 자유 라벨 / legacy "예수금" 등)은 별도 행으로 보존.
        if (brokerage.length > 0) {
            const storedByLabel = new Map(stored.map(s => [normalizeLabel(s.label), s]))
            const usedLabels = new Set<string>()
            const fromBrokerage: CashAccount[] = brokerage.map(ba => {
                const key = normalizeLabel(ba.name)
                const match = storedByLabel.get(key)
                if (match) usedLabels.add(key)
                return {
                    id: match?.id ?? `tmp-brokerage-${ba.id}`,
                    label: ba.name,
                    amount: match?.amount ?? '0',
                }
            })
            const orphans = stored.filter(s => !usedLabels.has(normalizeLabel(s.label)))
            setRows(toEditorRows([...fromBrokerage, ...orphans], currency, exchangeRate))
            return
        }

        // BrokerageAccount 가 없는 사용자 — 기존 로직 그대로.
        if (stored.length > 0) {
            setRows(toEditorRows(stored, currency, exchangeRate))
            return
        }
        // legacy: cashAccounts 도 없고 합계만 있는 사용자 — 단일 행으로 시드.
        if (initialBalance > 0) {
            setRows(toEditorRows(
                [{ id: 'legacy-seed', label: language === 'ko' ? '예수금' : 'Cash', amount: String(initialBalance) }],
                currency,
                exchangeRate,
            ))
        } else {
            setRows([])
        }
    }, [open, initialAccounts, brokerageAccounts, initialBalance, currency, exchangeRate, language])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const payload = fromEditorRows(rows, currency, exchangeRate)
            const result = await updateCashAccounts(payload)
            if (result.success) {
                toast.success(t('updateCashSuccess'))
                setOpen(false)
                onSuccess?.()
                startTransition(() => {
                    router.refresh()
                })
            } else {
                toast.error(result.error || t('updateCashFailed'))
            }
        } catch {
            toast.error(t('networkError'))
        } finally {
            setLoading(false)
        }
    }

    const isBusy = loading || isPending

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children ?? (
                    <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-foreground" disabled={isBusy}>
                        {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <Edit2 className="h-3 w-3" />
                        )}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{t('editCash')}</DialogTitle>
                    <DialogDescription>
                        {language === 'ko'
                            ? '여러 증권 계좌의 예수금을 따로 입력하면 자동으로 합산됩니다.'
                            : 'Enter each broker’s cash separately — totals are auto-summed.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <CashAccountEditor
                        accounts={rows}
                        onChange={setRows}
                        currency={currency}
                        disabled={isBusy}
                    />
                    <button
                        type="submit"
                        disabled={isBusy}
                        className="w-full bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 hover:opacity-90 inline-flex items-center justify-center gap-2 rounded-md"
                    >
                        {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isBusy ? t('saving') : t('confirm')}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
