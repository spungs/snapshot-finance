'use client'

import { useState, useEffect, useTransition } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import { updateCashBalance } from "@/app/actions/cash-actions"
import { invalidateSwPagesCache } from "@/lib/sw-invalidate"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Edit2, Loader2 } from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"
import { Currency } from "@/lib/currency/context"

interface CashBalanceDialogProps {
    initialBalance: number
    currency?: Currency
    exchangeRate?: number
    children?: React.ReactNode
    onSuccess?: () => void
}

export function CashBalanceDialog({
    initialBalance,
    currency = 'KRW',
    exchangeRate = 1435,
    children,
    onSuccess,
}: CashBalanceDialogProps) {
    const { t, language } = useLanguage()
    const [open, setOpen] = useState(false)
    const [balance, setBalance] = useState('')
    const [loading, setLoading] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    useEffect(() => {
        if (open) {
            let displayValue = initialBalance
            if (currency === 'USD') {
                displayValue = initialBalance / exchangeRate
            }
            setBalance(displayValue.toFixed(currency === 'USD' ? 2 : 0))
        }
    }, [open, initialBalance, currency, exchangeRate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const inputValue = parseFloat(balance.replace(/,/g, ""))
            if (isNaN(inputValue)) {
                toast.error(t('invalidAmount'))
                return
            }

            let finalAmount = inputValue
            if (currency === 'USD') {
                finalAmount = inputValue * exchangeRate
                finalAmount = Math.round(finalAmount)
            }

            const result = await updateCashBalance(finalAmount)
            if (result.success) {
                toast.success(t('updateCashSuccess'))
                setOpen(false)
                onSuccess?.()
                // SW StaleWhileRevalidate 가 stale 페이지 반환하지 않도록 캐시 클리어
                await invalidateSwPagesCache()
                startTransition(() => {
                    router.refresh()
                })
            } else {
                toast.error(t('updateCashFailed'))
            }
        } catch {
            toast.error(t('networkError'))
        } finally {
            setLoading(false)
        }
    }

    const isBusy = loading || isPending
    const pricePrefix = currency === 'KRW' ? '₩' : '$'

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
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{t('editCash')}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {language === 'ko' ? '예수금 잔고를 수정합니다.' : 'Update cash balance.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormattedNumberInput
                        id="cash"
                        label={`${t('cash')} (${currency})`}
                        prefix={pricePrefix}
                        value={balance}
                        onChange={(value) => setBalance(value)}
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
