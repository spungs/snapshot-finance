'use client'

import { useState, useEffect, useTransition } from "react"
import { Drawer } from "vaul"
import { Button } from "@/components/ui/button"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import { updateCashBalance } from "@/app/actions/cash-actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Edit2, Loader2, X } from "lucide-react"
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
        <Drawer.Root open={open} onOpenChange={setOpen}>
            <Drawer.Trigger asChild>
                {children ?? (
                    <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-foreground" disabled={isBusy}>
                        {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <Edit2 className="h-3 w-3" />
                        )}
                    </Button>
                )}
            </Drawer.Trigger>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background border-t rounded-t-2xl outline-none">
                    <div className="flex justify-center pt-3 pb-1 shrink-0">
                        <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                    </div>
                    <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
                        <Drawer.Title className="font-semibold text-sm m-0">
                            {t('editCash')}
                        </Drawer.Title>
                        <Drawer.Description className="sr-only">
                            {language === 'ko' ? '예수금 잔고를 수정합니다.' : 'Update cash balance.'}
                        </Drawer.Description>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="text-muted-foreground hover:text-foreground p-1"
                            aria-label={language === 'ko' ? '닫기' : 'Close'}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="p-4 space-y-3 pb-[calc(1rem+var(--safe-bottom,0px))]">
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
                            className="w-full bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 hover:opacity-90 inline-flex items-center justify-center gap-2"
                        >
                            {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isBusy ? t('saving') : t('confirm')}
                        </button>
                    </form>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
