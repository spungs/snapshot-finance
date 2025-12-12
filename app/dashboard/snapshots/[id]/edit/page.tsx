'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { snapshotsApi } from '@/lib/api/client'
import { formatCurrency } from '@/lib/utils/formatters'
import { useLanguage } from '@/lib/i18n/context'

interface HoldingInput {
    stockId: string
    stockName: string
    stockCode: string
    quantity: string
    averagePrice: string
    currentPrice: string
    currency: 'KRW' | 'USD'
    purchaseRate: string
}

export default function EditSnapshotPage() {
    const { t } = useLanguage()
    const router = useRouter()
    const params = useParams()
    const [holdings, setHoldings] = useState<HoldingInput[]>([])
    const [cashBalance, setCashBalance] = useState('')
    const [note, setNote] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [updatingPrices, setUpdatingPrices] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [summaryDisplayCurrency, setSummaryDisplayCurrency] = useState<'KRW' | 'USD'>('KRW')
    const [exchangeRate, setExchangeRate] = useState<number>(1435)

    // Date & History Logic
    const today = new Date().toISOString().split('T')[0]
    const [snapshotDate, setSnapshotDate] = useState<string>(today)
    const loadedDateRef = useRef<string | null>(null)

    useEffect(() => {
        async function fetchSnapshot() {
            try {
                const response = await snapshotsApi.getDetail(params.id as string)
                if (response.success && response.data) {
                    const snapshot = response.data
                    setCashBalance(snapshot.cashBalance.toString())
                    setNote(snapshot.note || '')
                    setExchangeRate(Number(snapshot.exchangeRate) || 1435)

                    const dateStr = snapshot.snapshotDate ? new Date(snapshot.snapshotDate).toISOString().split('T')[0] : today
                    loadedDateRef.current = dateStr
                    setSnapshotDate(dateStr)

                    const mappedHoldings = snapshot.holdings.map((h: any) => {
                        const currency = h.currency || 'KRW'
                        let purchaseRate = h.purchaseRate ? h.purchaseRate.toString() : '1'

                        // USD인데 환율이 1인 경우(데이터 오류), 기본값 1435로 설정하여 계산 오류 방지
                        if (currency === 'USD' && purchaseRate === '1') {
                            purchaseRate = '1435'
                        }

                        return {
                            stockId: h.stockId,
                            stockName: h.stock.stockName,
                            stockCode: h.stock.stockCode,
                            quantity: h.quantity.toString(),
                            averagePrice: h.averagePrice.toString(),
                            currentPrice: h.currentPrice.toString(),
                            currency,
                            purchaseRate,
                        }
                    })

                    setHoldings(mappedHoldings)
                } else {
                    setError(response.error?.message || t('loadFailed'))
                }
            } catch (err) {
                setError(t('networkError'))
            } finally {
                setLoading(false)
            }
        }

        if (params.id) {
            fetchSnapshot()
        }
    }, [params.id, today, t])

    // Fetch Exchange Rate AND Stock Prices when date changes
    useEffect(() => {
        if (snapshotDate === loadedDateRef.current) return

        async function updateData() {
            setUpdatingPrices(true)
            try {
                // 1. Update Exchange Rate
                let currentRate = 1435
                if (snapshotDate === today) {
                    setExchangeRate(1435)
                } else {
                    try {
                        const res = await fetch(`/api/stocks/history?symbol=KRW=X&market=FX&date=${snapshotDate}`)
                        const data = await res.json()
                        if (data.success && data.data) {
                            currentRate = data.data.close || 1435
                            setExchangeRate(currentRate)
                        } else {
                            setExchangeRate(1435)
                        }
                    } catch (e) {
                        setExchangeRate(1435)
                    }
                }

                // 2. Update Stock Prices for existing holdings
                if (holdings.length > 0 && !(holdings.length === 1 && !holdings[0].stockId)) {
                    const updatedHoldings = await Promise.all(holdings.map(async (h) => {
                        if (!h.stockCode) return h

                        const market = isNaN(Number(h.stockCode)) ? 'US' : 'KOSPI'
                        let price = h.currentPrice

                        try {
                            if (snapshotDate === today) {
                                const res = await fetch(`/api/kis/price?symbol=${h.stockCode}&market=${market}`)
                                const data = await res.json()
                                if (data.success && data.data && data.data.price) {
                                    price = data.data.price.toString()
                                }
                            } else {
                                const res = await fetch(`/api/stocks/history?symbol=${h.stockCode}&market=${market}&date=${snapshotDate}`)
                                const data = await res.json()
                                if (data.success && data.data && data.data.close) {
                                    price = data.data.close.toString()
                                }
                            }
                        } catch (e) {
                            console.error(`Failed to update price for ${h.stockCode}`, e)
                        }

                        return { ...h, currentPrice: price }
                    }))

                    setHoldings(updatedHoldings)
                }
            } finally {
                setUpdatingPrices(false)
            }
        }

        updateData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshotDate]) // Only depend on snapshotDate

    function addHolding() {
        setHoldings([
            ...holdings,
            {
                stockId: '',
                stockName: '',
                stockCode: '',
                quantity: '',
                averagePrice: '',
                currentPrice: '',
                currency: 'KRW',
                purchaseRate: '1'
            },
        ])
    }

    function removeHolding(index: number) {
        if (holdings.length === 1) return
        setHoldings(holdings.filter((_, i) => i !== index))
    }

    function updateHolding(
        index: number,
        field: keyof HoldingInput,
        value: string
    ) {
        const updated = [...holdings]
        updated[index] = { ...updated[index], [field]: value }
        setHoldings(updated)
    }

    async function handleStockSelect(index: number, stock: { id: string; stockName: string; stockCode: string; market?: string }) {
        const updated = [...holdings]
        updated[index] = {
            ...updated[index],
            stockId: stock.id,
            stockName: stock.stockName,
            stockCode: stock.stockCode,
        }
        setHoldings(updated)

        // Fetch price logic (Context-aware)
        try {
            const market = stock.market || (isNaN(Number(stock.stockCode)) ? 'US' : 'KOSPI')

            const newCurrency = market === 'US' ? 'USD' : 'KRW'
            const newPurchaseRate = market === 'US' ? exchangeRate.toString() : '1'

            let price = '0'

            if (snapshotDate === today) {
                const res = await fetch(`/api/kis/price?symbol=${stock.stockCode}&market=${market}`)
                const data = await res.json()
                if (data.success && data.data?.price) {
                    price = data.data.price.toString()
                }
            } else {
                const res = await fetch(`/api/stocks/history?symbol=${stock.stockCode}&market=${market}&date=${snapshotDate}`)
                const data = await res.json()
                if (data.success && data.data?.close) {
                    price = data.data.close.toString()
                }
            }

            setHoldings((prev) => {
                const current = [...prev]
                if (!current[index] || current[index].stockId !== stock.id) return prev

                current[index] = {
                    ...current[index],
                    currentPrice: price === '0' ? current[index].currentPrice : price,
                    currency: newCurrency,
                    purchaseRate: newPurchaseRate
                }
                return current
            })

        } catch (error) {
            console.error('Failed to fetch price:', error)
        }
    }

    function calculateTotals(displayCurrency: 'KRW' | 'USD') {
        let totalCost = 0
        let totalValue = 0

        holdings.forEach((h) => {
            const qty = parseFloat(h.quantity) || 0
            const avg = parseFloat(h.averagePrice) || 0
            const curr = parseFloat(h.currentPrice) || 0
            const pRate = parseFloat(h.purchaseRate) || 1

            if (displayCurrency === 'USD') {
                if (h.currency === 'USD') {
                    totalCost += qty * avg
                    totalValue += qty * curr
                } else {
                    totalCost += (qty * avg) / exchangeRate
                    totalValue += (qty * curr) / exchangeRate
                }
            } else {
                if (h.currency === 'USD') {
                    totalCost += qty * avg * pRate
                    totalValue += qty * curr * exchangeRate
                } else {
                    totalCost += qty * avg
                    totalValue += qty * curr
                }
            }
        })

        const profit = totalValue - totalCost
        const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0

        return { totalCost, totalValue, profit, profitRate, currency: displayCurrency }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        const validHoldings = holdings.filter(
            (h) =>
                h.stockId &&
                parseFloat(h.quantity) > 0 &&
                parseFloat(h.averagePrice) > 0 &&
                parseFloat(h.currentPrice) > 0
        )

        if (validHoldings.length === 0) {
            setError(t('minHoldingsError'))
            return
        }

        setSaving(true)

        try {
            const response = await snapshotsApi.update(params.id as string, {
                snapshotDate,
                exchangeRate,
                holdings: validHoldings.map((h) => ({
                    stockId: h.stockId,
                    quantity: parseInt(h.quantity),
                    averagePrice: parseFloat(h.averagePrice),
                    currentPrice: parseFloat(h.currentPrice),
                    currency: h.currency,
                    purchaseRate: parseFloat(h.purchaseRate)
                })),
                cashBalance: parseFloat(cashBalance) || 0,
                note: note || undefined,
            })

            if (response.success) {
                router.push(`/dashboard/snapshots/${params.id}`)
            } else {
                setError(response.error?.message || t('updateFailed'))
                setSaving(false)
            }
        } catch (err) {
            setError(t('networkError'))
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center gap-4">
                <div className="w-64 max-w-full space-y-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div className="h-full bg-primary animate-indeterminate rounded-full" />
                    </div>
                </div>
            </div>
        )
    }

    if (error && !holdings.length) {
        return (
            <div className="text-center py-12">
                <p className="text-destructive mb-4">{error}</p>
                <Link href="/dashboard/snapshots">
                    <Button>{t('backToList')}</Button>
                </Link>
            </div>
        )
    }

    const totals = calculateTotals(summaryDisplayCurrency)
    const isProfit = totals.profit >= 0

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={`/dashboard/snapshots/${params.id}`}
                    className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block"
                >
                    ← {t('snapshotDetail')}
                </Link>
                <h1 className="text-2xl font-bold">{t('editSnapshot')}</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Date Picker */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('snapshotDate')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Label htmlFor="snapshotDate">{t('date')}</Label>
                            <Input
                                id="snapshotDate"
                                type="date"
                                max={today}
                                value={snapshotDate}
                                disabled={saving}
                                onChange={(e) => {
                                    loadedDateRef.current = null // Enable fetching on change
                                    setSnapshotDate(e.target.value)
                                }}
                            />
                            <p className="text-xs text-muted-foreground">
                                {t('historicalMode')}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {t('exchangeRate')}: ₩{exchangeRate.toLocaleString()} / USD
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                            <span>{t('holdings')}</span>
                            <Button type="button" variant="outline" onClick={addHolding} disabled={saving}>
                                + {t('addStock')}
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {holdings.map((holding, index) => (
                            <div
                                key={index}
                                className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg"
                            >
                                <div className="md:col-span-4 flex justify-between items-center">
                                    <span className="font-medium">{t('stockIndex')} {index + 1}</span>
                                    {holdings.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => removeHolding(index)}
                                            disabled={saving}
                                        >
                                            {t('delete')}
                                        </Button>
                                    )}
                                </div>

                                <div className="md:col-span-2">
                                    <Label htmlFor={`stock-${index}`}>{t('stock')}</Label>
                                    <StockSearchCombobox
                                        value={holding.stockName ? `${holding.stockName} (${holding.stockCode})` : ''}
                                        onSelect={(stock) => handleStockSelect(index, stock)}
                                        disabled={saving}
                                    />
                                    {holding.stockCode && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {snapshotDate === today ? t('currentPrice') : `${snapshotDate} ${t('closingPrice')}`}: {formatCurrency(parseFloat(holding.currentPrice) || 0, holding.currency)}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <Label htmlFor={`quantity-${index}`}>{t('quantity')}</Label>
                                    <FormattedNumberInput
                                        id={`quantity-${index}`}
                                        min="1"
                                        placeholder="100"
                                        value={holding.quantity}
                                        disabled={saving}
                                        onChange={(val) =>
                                            updateHolding(index, 'quantity', val)
                                        }
                                    />
                                </div>

                                <div>
                                    <Label htmlFor={`avgPrice-${index}`}>
                                        {t('avgPrice')} ({holding.currency === 'USD' ? '$' : '₩'})
                                    </Label>
                                    <FormattedNumberInput
                                        id={`avgPrice-${index}`}
                                        min="0"
                                        step="0.0001"
                                        placeholder={holding.currency === 'USD' ? '10.00' : '1,000'}
                                        value={holding.averagePrice}
                                        disabled={saving}
                                        onChange={(val) =>
                                            updateHolding(index, 'averagePrice', val)
                                        }
                                    />
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('additionalInfo')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="note">{t('memo')}</Label>
                            <Input
                                id="note"
                                type="text"
                                placeholder={t('memoPlaceholder')}
                                value={note}
                                disabled={saving}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                            <span>{t('summary')}</span>
                            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                                <Button
                                    type="button"
                                    variant={summaryDisplayCurrency === 'KRW' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="h-7 px-3"
                                    onClick={() => setSummaryDisplayCurrency('KRW')}
                                    disabled={saving}
                                >
                                    ₩ KRW
                                </Button>
                                <Button
                                    type="button"
                                    variant={summaryDisplayCurrency === 'USD' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="h-7 px-3"
                                    onClick={() => setSummaryDisplayCurrency('USD')}
                                    disabled={saving}
                                >
                                    $ USD
                                </Button>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">{t('totalValue')}</p>
                                <p className="text-lg font-semibold">
                                    {formatCurrency(totals.totalValue, totals.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{t('totalInvested')}</p>
                                <p className="text-lg font-semibold">
                                    {formatCurrency(totals.totalCost, totals.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{t('pl')}</p>
                                <p
                                    className={`text-lg font-semibold ${isProfit ? 'text-red-600' : 'text-blue-600'
                                        }`}
                                >
                                    {formatCurrency(Math.abs(totals.profit), totals.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{t('returnRate')}</p>
                                <p
                                    className={`text-lg font-semibold ${isProfit ? 'text-red-600' : 'text-blue-600'
                                        }`}
                                >
                                    {Math.abs(totals.profitRate).toFixed(2)}%
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {error && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
                        {error}
                    </div>
                )}

                <div className="flex gap-4">
                    <Button type="submit" disabled={saving || updatingPrices} className="flex-1">
                        {saving ? t('saving') : (updatingPrices ? t('calculating') : t('saveChanges'))}
                    </Button>
                    <Link href={`/dashboard/snapshots/${params.id}`} className="flex-1">
                        <Button type="button" variant="outline" className="w-full">
                            {t('cancel')}
                        </Button>
                    </Link>
                </div>
            </form>
        </div>
    )
}
