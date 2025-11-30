'use client'

import { useEffect, useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'

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

import { useLanguage } from '@/lib/i18n/context'

export default function EditSnapshotPage() {
    const { t } = useLanguage()
    const router = useRouter()
    const params = useParams()
    const [holdings, setHoldings] = useState<HoldingInput[]>([])
    const [cashBalance, setCashBalance] = useState('')
    const [note, setNote] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [summaryDisplayCurrency, setSummaryDisplayCurrency] = useState<'KRW' | 'USD'>('KRW')

    // Global current exchange rate for valuation
    const CURRENT_EXCHANGE_RATE = 1435

    useEffect(() => {
        async function fetchSnapshot() {
            try {
                const response = await snapshotsApi.getDetail(params.id as string)
                if (response.success && response.data) {
                    const snapshot = response.data
                    setCashBalance(snapshot.cashBalance.toString())
                    setNote(snapshot.note || '')

                    const mappedHoldings = snapshot.holdings.map((h: any) => ({
                        stockId: h.stockId,
                        stockName: h.stock.stockName,
                        stockCode: h.stock.stockCode,
                        quantity: h.quantity.toString(),
                        averagePrice: h.averagePrice.toString(),
                        currentPrice: h.currentPrice.toString(),
                        currency: h.currency || 'KRW',
                        purchaseRate: h.purchaseRate ? h.purchaseRate.toString() : '1'
                    }))

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
    }, [params.id])

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

        // Fetch real-time price
        try {
            const market = stock.market || (isNaN(Number(stock.stockCode)) ? 'US' : 'KOSPI')

            const newCurrency = market === 'US' ? 'USD' : 'KRW'
            const newPurchaseRate = market === 'US' ? '1430' : '1'

            const res = await fetch(`/api/kis/price?symbol=${stock.stockCode}&market=${market}`)
            const data = await res.json()

            if (data.success && data.data && data.data.price !== undefined && data.data.price !== null) {
                const newHoldings = [...updated]
                newHoldings[index] = {
                    ...newHoldings[index],
                    stockId: stock.id,
                    stockName: stock.stockName,
                    stockCode: stock.stockCode,
                    currentPrice: data.data.price.toString(),
                    currency: newCurrency,
                    purchaseRate: newPurchaseRate
                }
                setHoldings(newHoldings)
            } else {
                const newHoldings = [...updated]
                newHoldings[index] = {
                    ...newHoldings[index],
                    stockId: stock.id,
                    stockName: stock.stockName,
                    stockCode: stock.stockCode,
                    currency: newCurrency,
                    purchaseRate: newPurchaseRate
                }
                setHoldings(newHoldings)
            }
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
                // USD로 표시할 경우
                if (h.currency === 'USD') {
                    totalCost += qty * avg
                    totalValue += qty * curr
                } else {
                    // KRW -> USD 변환
                    totalCost += (qty * avg) / CURRENT_EXCHANGE_RATE
                    totalValue += (qty * curr) / CURRENT_EXCHANGE_RATE
                }
            } else {
                // KRW로 표시할 경우
                if (h.currency === 'USD') {
                    // USD -> KRW 변환 (매입가는 purchaseRate 사용, 현재가는 현재환율 사용)
                    totalCost += qty * avg * pRate
                    totalValue += qty * curr * CURRENT_EXCHANGE_RATE
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
            }
        } catch (err) {
            setError(t('networkError'))
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-96" />
            </div>
        )
    }

    if (error && !holdings.length) {
        return (
            <div className="text-center py-12">
                <p className="text-red-500 mb-4">{error}</p>
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
                    className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
                >
                    ← {t('snapshotDetail')}
                </Link>
                <h1 className="text-2xl font-bold">{t('editSnapshot')}</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                            <span>{t('holdings')}</span>
                            <Button type="button" variant="outline" onClick={addHolding}>
                                + {t('addStock')}
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {holdings.map((holding, index) => (
                            <div
                                key={index}
                                className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border rounded-lg"
                            >
                                <div className="md:col-span-6 flex justify-between items-center">
                                    <span className="font-medium">{t('stockIndex')} {index + 1}</span>
                                    {holdings.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500"
                                            onClick={() => removeHolding(index)}
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
                                    />
                                </div>

                                <div>
                                    <Label htmlFor={`quantity-${index}`}>{t('quantity')}</Label>
                                    <FormattedNumberInput
                                        id={`quantity-${index}`}
                                        min="1"
                                        placeholder="100"
                                        value={holding.quantity}
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
                                        onChange={(val) =>
                                            updateHolding(index, 'averagePrice', val)
                                        }
                                    />
                                </div>

                                <div>
                                    <Label htmlFor={`currPrice-${index}`}>
                                        {t('currentPrice')} ({holding.currency === 'USD' ? '$' : '₩'})
                                    </Label>
                                    <FormattedNumberInput
                                        id={`currPrice-${index}`}
                                        min="0"
                                        step="0.0001"
                                        placeholder={holding.currency === 'USD' ? '20.00' : '2,000'}
                                        value={holding.currentPrice}
                                        onChange={(val) =>
                                            updateHolding(index, 'currentPrice', val)
                                        }
                                    />
                                </div>

                                <div>
                                    <Label htmlFor={`pRate-${index}`}>{t('exchangeRate')}</Label>
                                    <FormattedNumberInput
                                        id={`pRate-${index}`}
                                        min="0"
                                        placeholder="1"
                                        value={holding.purchaseRate}
                                        onChange={(val) => updateHolding(index, 'purchaseRate', val)}
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="cashBalance">{t('cash')}</Label>
                                <FormattedNumberInput
                                    id="cashBalance"
                                    min="0"
                                    placeholder="0"
                                    value={cashBalance}
                                    onChange={(val) => setCashBalance(val)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="note">{t('memo')}</Label>
                                <Input
                                    id="note"
                                    type="text"
                                    placeholder={t('memoPlaceholder')}
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                            <span>{t('summary')}</span>
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                                <Button
                                    type="button"
                                    variant={summaryDisplayCurrency === 'KRW' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="h-7 px-3"
                                    onClick={() => setSummaryDisplayCurrency('KRW')}
                                >
                                    ₩ KRW
                                </Button>
                                <Button
                                    type="button"
                                    variant={summaryDisplayCurrency === 'USD' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="h-7 px-3"
                                    onClick={() => setSummaryDisplayCurrency('USD')}
                                >
                                    $ USD
                                </Button>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-sm text-gray-500">{t('totalInvested')}</p>
                                <p className="text-lg font-semibold">
                                    {formatCurrency(totals.totalCost, totals.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">{t('totalValue')}</p>
                                <p className="text-lg font-semibold">
                                    {formatCurrency(totals.totalValue, totals.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">{t('pl')}</p>
                                <p
                                    className={`text-lg font-semibold ${isProfit ? 'text-red-600' : 'text-blue-600'
                                        }`}
                                >
                                    {isProfit ? '+' : ''}
                                    {formatCurrency(totals.profit, totals.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">{t('returnRate')}</p>
                                <p
                                    className={`text-lg font-semibold ${isProfit ? 'text-red-600' : 'text-blue-600'
                                        }`}
                                >
                                    {isProfit ? '+' : ''}
                                    {totals.profitRate.toFixed(2)}%
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                        {error}
                    </div>
                )}

                <div className="flex gap-4">
                    <Button type="submit" disabled={saving} className="flex-1">
                        {saving ? t('saving') : t('saveChanges')}
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
