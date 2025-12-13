import { useState, useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import { Label } from "@/components/ui/label"
import { updateCashBalance } from "@/app/actions/cash-actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Edit2, Loader2 } from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"
import { Currency } from "@/lib/currency/context"

interface CashBalanceDialogProps {
    initialBalance: number
    currency?: Currency
    exchangeRate?: number
}

export function CashBalanceDialog({ initialBalance, currency = 'KRW', exchangeRate = 1435 }: CashBalanceDialogProps) {
    const { t } = useLanguage()
    const [open, setOpen] = useState(false)
    const [balance, setBalance] = useState('')
    const [loading, setLoading] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    // Initialize balance based on currency when dialog opens
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
                startTransition(() => {
                    router.refresh()
                })
            } else {
                toast.error(t('updateCashFailed'))
            }
        } catch (error) {
            toast.error(t('networkError'))
        } finally {
            setLoading(false)
        }
    }

    const isBusy = loading || isPending

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-foreground" disabled={isBusy}>
                    {isBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <Edit2 className="h-3 w-3" />
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('editCash')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="cash">
                            {t('cash')} ({currency})
                        </Label>
                        <FormattedNumberInput
                            id="cash"
                            value={balance}
                            onChange={(value) => setBalance(value)}
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">
                                {t('cancel')}
                            </Button>
                        </DialogClose>
                        <Button type="submit" disabled={isBusy}>
                            {isBusy ? t('saving') : t('confirm')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
