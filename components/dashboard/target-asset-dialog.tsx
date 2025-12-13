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
import { updateTargetAsset } from "@/app/actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Edit2, Loader2, Target } from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"
import { Currency } from "@/lib/currency/context"

interface TargetAssetDialogProps {
    initialTarget: number
    currency?: Currency
    exchangeRate?: number
    trigger?: React.ReactNode
}

export function TargetAssetDialog({ initialTarget, currency = 'KRW', exchangeRate = 1435, trigger }: TargetAssetDialogProps) {
    const { t } = useLanguage()
    const [open, setOpen] = useState(false)
    const [amount, setAmount] = useState('')
    const [loading, setLoading] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    // Initialize based on currency when dialog opens
    useEffect(() => {
        if (open) {
            let displayValue = initialTarget
            if (currency === 'USD') {
                displayValue = initialTarget / exchangeRate
            }
            // If value is 0, display empty string or 0? 0 is fine.
            setAmount(displayValue.toFixed(currency === 'USD' ? 2 : 0))
        }
    }, [open, initialTarget, currency, exchangeRate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const inputValue = parseFloat(amount.replace(/,/g, "")) // FormattedNumberInput handles commas but just in case
            if (isNaN(inputValue)) {
                toast.error(t('invalidAmount') || 'Invalid amount')
                return
            }

            let finalAmount = inputValue
            if (currency === 'USD') {
                finalAmount = inputValue * exchangeRate
                finalAmount = Math.round(finalAmount)
            }

            const result = await updateTargetAsset(finalAmount)
            // Actually, server action usually takes userId. 
            // `updateTargetAsset` in `actions.ts` takes `userId`.
            // But this is a client component. How do I get userId?
            // Usually passed as prop or retrieved from session in server action if not passed?
            // Existing `updateCashBalance` uses `auth()` in server action? 
            // Let's check `cash-actions.ts`.

            if (result.success) {
                toast.success(t('targetUpdateSuccess') || 'Goal updated')
                setOpen(false)
                startTransition(() => {
                    router.refresh()
                })
            } else {
                toast.error(t('targetUpdateFailed') || 'Failed to update')
            }
        } catch (error) {
            toast.error(t('networkError') || 'Network error')
        } finally {
            setLoading(false)
        }
    }

    const isBusy = loading || isPending

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ? trigger : (
                    <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-foreground" disabled={isBusy}>
                        {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <Edit2 className="h-3 w-3" />
                        )}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('setTargetAsset')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="target">
                            {t('targetAsset')} ({currency})
                        </Label>
                        <FormattedNumberInput
                            id="target"
                            value={amount}
                            onChange={(value) => setAmount(value)}
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
