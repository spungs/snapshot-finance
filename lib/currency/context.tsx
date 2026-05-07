'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useLanguage } from '@/lib/i18n/context'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'

export type Currency = 'KRW' | 'USD'

interface CurrencyContextType {
    baseCurrency: Currency
    setBaseCurrency: (currency: Currency) => void
    exchangeRate: number
    setExchangeRate: (rate: number) => void
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
    const [baseCurrency, setBaseCurrencyState] = useState<Currency>('KRW')
    const [exchangeRate, setExchangeRate] = useState<number>(FALLBACK_USD_RATE)

    useEffect(() => {
        const savedCurrency = localStorage.getItem('baseCurrency') as Currency
        if (savedCurrency) {
            setBaseCurrencyState(savedCurrency)
        }
    }, [])

    // Sync with Language
    const { language } = useLanguage()
    useEffect(() => {
        if (language === 'en') {
            setBaseCurrencyState('USD')
        } else {
            setBaseCurrencyState('KRW')
        }
    }, [language])

    const setBaseCurrency = (currency: Currency) => {
        setBaseCurrencyState(currency)
        localStorage.setItem('baseCurrency', currency)
    }

    return (
        <CurrencyContext.Provider value={{ baseCurrency, setBaseCurrency, exchangeRate, setExchangeRate }}>
            {children}
        </CurrencyContext.Provider>
    )
}

export function useCurrency() {
    const context = useContext(CurrencyContext)
    if (context === undefined) {
        throw new Error('useCurrency must be used within a CurrencyProvider')
    }
    return context
}
