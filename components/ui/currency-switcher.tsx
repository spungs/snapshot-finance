'use client'

import { Button } from '@/components/ui/button'
import { useCurrency } from '@/lib/currency/context'

export function CurrencySwitcher() {
    const { baseCurrency, setBaseCurrency } = useCurrency()

    const toggleCurrency = () => {
        setBaseCurrency(baseCurrency === 'KRW' ? 'USD' : 'KRW')
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={toggleCurrency}
            className="fixed bottom-4 right-20 z-50 rounded-full shadow-lg"
        >
            {baseCurrency === 'KRW' ? '₩' : '$'}
        </Button>
    )
}
