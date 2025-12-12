'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { snapshotsApi, holdingsApi } from '@/lib/api/client'
import { formatCurrency } from '@/lib/utils/formatters'
import { useLanguage } from '@/lib/i18n/context'
import { Download, Loader2 } from 'lucide-react'

const TEST_ACCOUNT_ID = 'test-account-1'

interface Stock {
  id: string
  stockCode: string
  stockName: string
}

interface HoldingInput {
  stockId: string
  stockName: string // Added for display
  stockCode: string // Added for display
  quantity: string
  averagePrice: string
  currentPrice: string
  currency: 'KRW' | 'USD'
  purchaseRate: string
}

export default function NewSnapshotPage() {
  const router = useRouter()
  const { t, language } = useLanguage()
  const today = new Date().toISOString().split('T')[0]
  const [snapshotDate, setSnapshotDate] = useState(today)
  const [holdings, setHoldings] = useState<HoldingInput[]>([
    { stockId: '', stockName: '', stockCode: '', quantity: '', averagePrice: '', currentPrice: '', currency: 'KRW', purchaseRate: '1' },
  ])
  const [cashBalance, setCashBalance] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summaryDisplayCurrency, setSummaryDisplayCurrency] = useState<'KRW' | 'USD'>('KRW')
  const [exchangeRate, setExchangeRate] = useState<number>(1435)
  const [updatingPrices, setUpdatingPrices] = useState(false)
  // Sync summary currency with language
  useEffect(() => {
    if (language === 'en') {
      setSummaryDisplayCurrency('USD')
    } else {
      setSummaryDisplayCurrency('KRW')
    }
  }, [language])


  // Fetch Exchange Rate AND Stock Prices when date changes
  useEffect(() => {
    async function updateData() {
      setUpdatingPrices(true)
      try {
        // 1. Update Exchange Rate
        let currentRate = 1435
        if (snapshotDate === today) {
          try {
            const res = await fetch('/api/exchange-rate')
            const data = await res.json()
            if (data.success && data.rate) {
              currentRate = data.rate
              setExchangeRate(currentRate)
            } else {
              console.warn('Failed to fetch current exchange rate, using default 1435.')
              setExchangeRate(1435)
            }
          } catch (e) {
            console.error('Failed to fetch current exchange rate', e)
            setExchangeRate(1435)
          }
        } else {
          console.log('Fetching historical exchange rate for:', snapshotDate)
          try {
            const res = await fetch(`/api/stocks/history?symbol=KRW=X&market=FX&date=${snapshotDate}`)
            const data = await res.json()
            if (data.success && data.data) {
              currentRate = data.data.close || 1435
              setExchangeRate(currentRate)
            } else {
              console.warn('Failed to fetch historical exchange rate, using default 1435.')
              setExchangeRate(1435)
            }
          } catch (e) {
            console.error('Failed to fetch historical exchange rate', e)
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
  }, [snapshotDate, today]) // Intentionally omit holdings to rely on closure value at time of date change, and avoid loop

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

    // Fetch price (Current or Historical)
    try {
      const market = stock.market || (isNaN(Number(stock.stockCode)) ? 'US' : 'KOSPI')
      const isToday = snapshotDate === today

      // Auto-set currency based on market
      const newCurrency = market === 'US' ? 'USD' : 'KRW'
      // For USD stocks, default purchase rate is the current exchange rate (or historical if selected)
      const newPurchaseRate = market === 'US' ? exchangeRate.toString() : '1'

      let price = ''
      let res, data;

      if (isToday) {
        res = await fetch(`/api/kis/price?symbol=${stock.stockCode}&market=${market}`)
        data = await res.json()
        if (data.success && data.data && data.data.price !== undefined && data.data.price !== null) {
          price = data.data.price.toString()
        }
      } else {
        res = await fetch(`/api/stocks/history?symbol=${stock.stockCode}&market=${market}&date=${snapshotDate}`)
        data = await res.json()
        if (data.success && data.data && data.data.close !== undefined && data.data.close !== null) {
          price = data.data.close.toString()
        }
      }

      setHoldings((prev) => {
        const current = [...prev]
        if (!current[index] || current[index].stockId !== stock.id) return prev

        current[index] = {
          ...current[index],
          currentPrice: price !== '' ? price : current[index].currentPrice,
          currency: newCurrency,
          purchaseRate: newPurchaseRate
        }
        return current
      })

    } catch (error) {
      console.error('Failed to fetch price:', error)
      // Don't block UI, just don't fill price
    }
  }

  async function loadCurrentHoldings() {
    if (confirm(t('loadCurrentHoldingsConfirm'))) {
      setLoading(true)
      try {
        const response = await holdingsApi.getList()
        if (response.success && response.data) {
          const newHoldings: HoldingInput[] = response.data.holdings.map((h: any) => {
            const currency = h.currency || 'KRW'
            // If USD stock has no valid purchaseRate (e.g. 1 or 0), assume current exchange rate as fallback estimate
            // to prevent total cost from being calculated as (USD_Amount * 1 KRW)
            const rawPurchaseRate = h.purchaseRate?.toString()
            let purchaseRate = rawPurchaseRate || '1'
            if (currency === 'USD' && (!rawPurchaseRate || rawPurchaseRate === '1')) {
              purchaseRate = exchangeRate.toString()
            }

            return {
              stockId: h.stockId,
              stockName: h.stockName,
              stockCode: h.stockCode,
              quantity: h.quantity.toString(),
              averagePrice: h.averagePrice.toString(),
              currentPrice: h.currentPrice.toString(),
              currency: currency,
              purchaseRate: purchaseRate,
            }
          })
          setHoldings(newHoldings)
        } else {
          setError(t('loadFailed') || 'Failed to load holdings')
        }
      } catch (err) {
        setError(t('networkError'))
      } finally {
        setLoading(false)
      }
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
          totalCost += (qty * avg) / exchangeRate
          totalValue += (qty * curr) / exchangeRate
        }
      } else {
        // KRW로 표시할 경우
        if (h.currency === 'USD') {
          // USD -> KRW 변환 (매입가는 purchaseRate 사용, 현재가는 현재환율 사용)
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

    // 유효성 검사
    const validHoldings = holdings.filter(
      (h) =>
        h.stockId &&
        parseFloat(h.quantity) > 0 &&
        parseFloat(h.averagePrice) > 0 &&
        parseFloat(h.currentPrice) > 0
    )

    if (validHoldings.length === 0) {
      setError(t('searchError')) // Using generic error for now, or add specific key
      return
    }

    setLoading(true)

    try {
      const response = await snapshotsApi.create({
        snapshotDate: snapshotDate, // Pass the selected date
        exchangeRate: exchangeRate, // Pass the selected/fetched exchange rate
        holdings: validHoldings.map((h) => ({
          stockId: h.stockId,
          quantity: parseInt(h.quantity),
          averagePrice: parseFloat(h.averagePrice),
          currentPrice: parseFloat(h.currentPrice),
          currency: h.currency, // Include currency
          purchaseRate: parseFloat(h.purchaseRate),
        })),
        cashBalance: parseFloat(cashBalance) || 0,
        note: note || undefined,
      })

      if (response.success) {
        router.push('/dashboard/snapshots')
      } else {
        setError(response.error?.message || t('searchError'))
        setLoading(false)
      }
    } catch (err) {
      setError(t('networkError'))
      setLoading(false)
    }
  }

  const totals = calculateTotals(summaryDisplayCurrency)
  const isProfit = totals.profit >= 0

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <div className="flex justify-between items-start mb-2">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-700 inline-block"
          >
            ← {t('dashboard')}
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadCurrentHoldings}
            disabled={loading || updatingPrices}
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t('loadCurrentHoldings')}
          </Button>
        </div>
        <h1 className="text-2xl font-bold">{t('newSnapshot')}</h1>
        <p className="text-gray-500">
          {t('newSnapshotDesc')}
        </p>
      </div>

      {/* 날짜 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('snapshotDate') || 'Snapshot Date'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="snapshotDate">{t('date') || 'Date'}</Label>
            <Input
              id="snapshotDate"
              type="date"
              max={today}
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              className="w-full md:w-1/3"
            />
            {snapshotDate !== today && (
              <p className="text-sm text-blue-600">
                {t('historicalMode') || '* Past date selected. Stock prices and exchange rates will be automatically fetched for this date.'}
              </p>
            )}
            <p className="text-sm text-gray-500">
              {t('exchangeRate')}: {formatCurrency(exchangeRate, 'KRW')} / USD
            </p>
          </div>
        </CardContent>
      </Card>


      <form onSubmit={handleSubmit} className="space-y-6 relative">
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-gray-600 animate-pulse">{t('calculating') || 'Loading...'}</p>
            </div>
          </div>
        )}

        {/* 보유 종목 입력 */}
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
                className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg"
              >
                <div className="md:col-span-4 flex justify-between items-center">
                  <span className="font-medium">{t('stock')} {index + 1}</span>
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
                  {holding.stockCode && (
                    <p className="text-xs text-stone-500 mt-1">
                      {snapshotDate === today ? t('currentPrice') : `${snapshotDate} ${t('closingPrice')}`}: {formatCurrency(parseFloat(holding.currentPrice) || 0, holding.currency)}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor={`quantity-${index}`}>{t('quantity')}</Label>
                  <FormattedNumberInput
                    id={`quantity-${index}`}
                    min="1"
                    placeholder={t('quantity')}
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
                    placeholder={t('avgPrice')}
                    value={holding.averagePrice}
                    onChange={(val) =>
                      updateHolding(index, 'averagePrice', val)
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 추가 정보 */}
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
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* 요약 미리보기 */}
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
                  {formatCurrency(Math.abs(totals.profit), totals.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('returnRate')}</p>
                <p
                  className={`text-lg font-semibold ${isProfit ? 'text-red-600' : 'text-blue-600'
                    }`}
                >
                  {(totals.profitRate > 0 ? '+' : '') + totals.profitRate.toFixed(2)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* 제출 버튼 */}
        <div className="flex gap-4">
          <Button type="submit" disabled={loading || updatingPrices} className="flex-1">
            {loading ? '...' : (updatingPrices ? t('calculating') || 'Calculating...' : t('save'))}
          </Button>
          <Link href="/dashboard" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              {t('cancel')}
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
