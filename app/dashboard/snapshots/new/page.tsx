'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { snapshotsApi, holdingsApi } from '@/lib/api/client'
import { formatCurrency } from '@/lib/utils/formatters'
import { useLanguage } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'
import { FALLBACK_USD_RATE } from '@/lib/api/exchange-rate'
import { ArrowLeft, Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  CashAccountEditor,
  type CashAccountRow,
  toEditorRows,
  fromEditorRows,
} from '@/components/dashboard/cash-account-editor'
import type { CashAccount } from '@/types/cash'

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

export default function NewSnapshotPage() {
  const router = useRouter()
  const { t, language } = useLanguage()
  const today = new Date().toISOString().split('T')[0]
  const [snapshotDate, setSnapshotDate] = useState(today)
  const [holdings, setHoldings] = useState<HoldingInput[]>([
    { stockId: '', stockName: '', stockCode: '', quantity: '', averagePrice: '', currentPrice: '', currency: 'KRW', purchaseRate: '1' },
  ])
  // 예수금은 계좌별 행으로 관리. 신규 스냅샷은 빈 상태로 시작하고,
  // "현재 잔고 불러오기" 시 사용자의 cashAccounts 또는 cashBalance 합계로 시드한다.
  const [cashRows, setCashRows] = useState<CashAccountRow[]>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summaryDisplayCurrency, setSummaryDisplayCurrency] = useState<'KRW' | 'USD'>('KRW')
  const [exchangeRate, setExchangeRate] = useState<number>(FALLBACK_USD_RATE)
  const [updatingPrices, setUpdatingPrices] = useState(false)

  // Abort controllers — cancel in-flight fetches on unmount (e.g., tab nav) and on supersession
  const dateChangeAbortRef = useRef<AbortController | null>(null)
  const loadCurrentAbortRef = useRef<AbortController | null>(null)
  const stockSelectAbortsRef = useRef<Set<AbortController>>(new Set())

  useEffect(() => () => {
    dateChangeAbortRef.current?.abort()
    loadCurrentAbortRef.current?.abort()
    stockSelectAbortsRef.current.forEach(c => c.abort())
    stockSelectAbortsRef.current.clear()
  }, [])

  useEffect(() => {
    if (language === 'en') {
      setSummaryDisplayCurrency('USD')
    } else {
      setSummaryDisplayCurrency('KRW')
    }
  }, [language])

  useEffect(() => {
    // Cancel any previous in-flight date-change refresh
    dateChangeAbortRef.current?.abort()
    const controller = new AbortController()
    dateChangeAbortRef.current = controller

    async function updateData() {
      setUpdatingPrices(true)
      try {
        let currentRate = FALLBACK_USD_RATE
        if (snapshotDate === today) {
          try {
            const res = await fetch('/api/exchange-rate', { signal: controller.signal })
            const data = await res.json()
            if (controller.signal.aborted) return
            if (data.success && data.rate) {
              currentRate = data.rate
              setExchangeRate(currentRate)
            } else {
              setExchangeRate(FALLBACK_USD_RATE)
            }
          } catch (e) {
            if ((e as Error).name === 'AbortError') return
            setExchangeRate(FALLBACK_USD_RATE)
          }
        } else {
          try {
            const res = await fetch(`/api/stocks/history?symbol=KRW=X&market=FX&date=${snapshotDate}`, { signal: controller.signal })
            const data = await res.json()
            if (controller.signal.aborted) return
            if (data.success && data.data) {
              currentRate = data.data.close || FALLBACK_USD_RATE
              setExchangeRate(currentRate)
            } else {
              setExchangeRate(FALLBACK_USD_RATE)
            }
          } catch (e) {
            if ((e as Error).name === 'AbortError') return
            setExchangeRate(FALLBACK_USD_RATE)
          }
        }

        if (holdings.length > 0 && !(holdings.length === 1 && !holdings[0].stockId)) {
          const updatedHoldings = await Promise.all(holdings.map(async (h) => {
            if (!h.stockCode) return h

            const market = isNaN(Number(h.stockCode)) ? 'US' : 'KOSPI'
            let price = h.currentPrice

            try {
              if (snapshotDate === today) {
                const res = await fetch(`/api/kis/price?symbol=${h.stockCode}&market=${market}`, { signal: controller.signal })
                const data = await res.json()
                if (data.success && data.data && data.data.price) {
                  price = data.data.price.toString()
                }
              } else {
                const res = await fetch(`/api/stocks/history?symbol=${h.stockCode}&market=${market}&date=${snapshotDate}`, { signal: controller.signal })
                const data = await res.json()
                if (data.success && data.data && data.data.close) {
                  price = data.data.close.toString()
                }
              }
            } catch (e) {
              if ((e as Error).name === 'AbortError') return h
              console.error(`Failed to update price for ${h.stockCode}`, e)
            }

            return { ...h, currentPrice: price }
          }))

          if (controller.signal.aborted) return
          setHoldings(updatedHoldings)
        }
      } finally {
        if (!controller.signal.aborted) setUpdatingPrices(false)
      }
    }

    updateData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotDate, today])

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
        purchaseRate: '1',
      },
    ])
  }

  function removeHolding(index: number) {
    if (holdings.length === 1) return
    setHoldings(holdings.filter((_, i) => i !== index))
  }

  function updateHolding(index: number, field: keyof HoldingInput, value: string) {
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

    const controller = new AbortController()
    stockSelectAbortsRef.current.add(controller)

    try {
      const market = stock.market || (isNaN(Number(stock.stockCode)) ? 'US' : 'KOSPI')
      const isToday = snapshotDate === today

      const newCurrency = market === 'US' ? 'USD' : 'KRW'
      const newPurchaseRate = market === 'US' ? exchangeRate.toString() : '1'

      let price = ''
      let res, data

      if (isToday) {
        res = await fetch(`/api/kis/price?symbol=${stock.stockCode}&market=${market}`, { signal: controller.signal })
        data = await res.json()
        if (data.success && data.data && data.data.price !== undefined && data.data.price !== null) {
          price = data.data.price.toString()
        }
      } else {
        res = await fetch(`/api/stocks/history?symbol=${stock.stockCode}&market=${market}&date=${snapshotDate}`, { signal: controller.signal })
        data = await res.json()
        if (data.success && data.data && data.data.close !== undefined && data.data.close !== null) {
          price = data.data.close.toString()
        }
      }

      if (controller.signal.aborted) return

      setHoldings((prev) => {
        const current = [...prev]
        if (!current[index] || current[index].stockId !== stock.id) return prev

        current[index] = {
          ...current[index],
          currentPrice: price !== '' ? price : current[index].currentPrice,
          currency: newCurrency,
          purchaseRate: newPurchaseRate,
        }
        return current
      })
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      console.error('Failed to fetch price:', error)
    } finally {
      stockSelectAbortsRef.current.delete(controller)
    }
  }

  // 불러오기 확인: native confirm() 대신 ConfirmDialog 사용 (UX 일관성)
  const [loadConfirmOpen, setLoadConfirmOpen] = useState(false)

  function loadCurrentHoldings() {
    setLoadConfirmOpen(true)
  }

  async function performLoadCurrentHoldings() {
    loadCurrentAbortRef.current?.abort()
    const controller = new AbortController()
    loadCurrentAbortRef.current = controller

    setLoading(true)
    try {
      const response = await holdingsApi.getList(controller.signal)
      if (controller.signal.aborted) return
      if (response.success && response.data) {
        const newHoldings: HoldingInput[] = response.data.holdings.map((h: any) => {
          const currency = h.currency || 'KRW'
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
            currency,
            purchaseRate,
          }
        })
        setHoldings(newHoldings)

        // 예수금 시드: 사용자의 cashAccounts 가 있으면 그대로, 없으면 합계만 1행으로.
        const summary = response.data.summary as { cashBalance?: number; cashAccounts?: CashAccount[] | null } | undefined
        const stored = summary?.cashAccounts
        if (stored && stored.length > 0) {
          setCashRows(toEditorRows(stored, 'KRW', exchangeRate))
        } else if (summary?.cashBalance && summary.cashBalance > 0) {
          setCashRows(toEditorRows(
            [{ id: 'legacy-seed', label: language === 'ko' ? '예수금' : 'Cash', amount: String(summary.cashBalance) }],
            'KRW',
            exchangeRate,
          ))
        } else {
          setCashRows([])
        }
      } else {
        setError(t('loadFailed') || 'Failed to load holdings')
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(t('networkError'))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
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
        parseFloat(h.currentPrice) > 0,
    )

    if (validHoldings.length === 0) {
      setError(t('searchError'))
      return
    }

    setLoading(true)

    try {
      const cashAccountsPayload = fromEditorRows(cashRows, 'KRW', exchangeRate)
      const response = await snapshotsApi.create({
        snapshotDate,
        exchangeRate,
        holdings: validHoldings.map((h) => ({
          stockId: h.stockId,
          quantity: parseInt(h.quantity),
          averagePrice: parseFloat(h.averagePrice),
          currentPrice: parseFloat(h.currentPrice),
          currency: h.currency,
          purchaseRate: parseFloat(h.purchaseRate),
        })),
        cashAccounts: cashAccountsPayload,
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
  const isHistorical = snapshotDate !== today

  return (
    <div className="max-w-[420px] md:max-w-2xl mx-auto w-full">
      {/* Top nav row */}
      <div className="px-6 pt-3 flex items-center justify-between">
        <Link
          href="/dashboard/snapshots"
          className="text-[11px] font-bold tracking-[1.5px] uppercase text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          {t('snapshots')}
        </Link>
        <button
          type="button"
          onClick={loadCurrentHoldings}
          disabled={loading || updatingPrices}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-primary px-2.5 py-1.5 hover:bg-accent-soft transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {t('loadCurrentHoldings')}
        </button>
      </div>

      {/* Hero */}
      <section className="px-6 pt-2 pb-4">
        <h1 className="hero-serif text-[32px] text-foreground">
          {t('newSnapshot')}
        </h1>
        <span className="serif-italic text-xs text-muted-foreground block mt-1">
          {t('newSnapshotDesc')}
        </span>
      </section>

      <form onSubmit={handleSubmit} className="relative">
        {loading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-9 h-9 animate-spin text-primary" />
              <p className="text-xs font-bold tracking-[1px] uppercase text-muted-foreground">
                {t('calculating') || 'Loading...'}
              </p>
            </div>
          </div>
        )}

        {/* Date card */}
        <section className="mx-4 mb-4 p-5 bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary" />
          <div className="eyebrow mb-2">
            {t('snapshotDate') || 'Snapshot Date'}
          </div>
          <input
            type="date"
            max={today}
            value={snapshotDate}
            onChange={(e) => setSnapshotDate(e.target.value)}
            className="w-full bg-transparent font-serif text-[22px] font-semibold text-foreground numeric outline-none border-b border-border pb-1.5 focus:border-primary transition-colors"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {t('exchangeRate')}
            </span>
            <span className="text-[12px] font-bold text-foreground numeric">
              {formatCurrency(exchangeRate, 'KRW')} / USD
            </span>
          </div>
          {isHistorical && (
            <div className="mt-3 pt-3 border-t border-border text-[11px] text-primary leading-relaxed">
              {t('historicalMode') || '* Past date selected. Stock prices and exchange rates will be automatically fetched for this date.'}
            </div>
          )}
        </section>

        {/* Holdings header */}
        <div className="px-6 pb-3 flex justify-between items-center gap-2">
          <span className="eyebrow">
            {t('holdings')} · {holdings.length}
          </span>
          <button
            type="button"
            onClick={addHolding}
            className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wide text-primary px-2 py-1 hover:bg-accent-soft transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addStock')}
          </button>
        </div>

        {/* Holdings list */}
        <div className="px-4 pb-4 space-y-2">
          {holdings.map((holding, index) => {
            const isUS = holding.currency === 'USD'
            const priceLabel = snapshotDate === today
              ? t('currentPrice')
              : `${snapshotDate} ${t('closingPrice')}`
            return (
              <div
                key={index}
                className="bg-card border border-border p-4"
                style={{ borderLeftWidth: '3px', borderLeftColor: holding.stockId ? 'var(--primary)' : 'var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
                    {language === 'ko' ? `종목 ${index + 1}` : `Stock ${index + 1}`}
                  </span>
                  {holdings.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeHolding(index)}
                      className="p-1 -mr-1 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={t('delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <StockSearchCombobox
                  value={holding.stockName ? `${holding.stockName} (${holding.stockCode})` : ''}
                  onSelect={(stock) => handleStockSelect(index, stock)}
                />

                {holding.stockCode && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground">{priceLabel}</span>
                    <span className="font-bold text-foreground numeric">
                      {formatCurrency(parseFloat(holding.currentPrice) || 0, holding.currency)}
                    </span>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <FormattedNumberInput
                    label={t('quantity')}
                    suffix={language === 'ko' ? '주' : 'shr'}
                    value={holding.quantity}
                    onChange={(val) => updateHolding(index, 'quantity', val)}
                  />
                  <FormattedNumberInput
                    label={t('avgPrice')}
                    prefix={isUS ? '$' : '₩'}
                    value={holding.averagePrice}
                    onChange={(val) => updateHolding(index, 'averagePrice', val)}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Cash accounts — 계좌별 예수금. 합계는 에디터 하단에 자동 표시. */}
        <div className="px-6 pb-3">
          <span className="eyebrow">{t('cash')}</span>
        </div>
        <section className="mx-4 mb-4 p-4 bg-card border border-border">
          <CashAccountEditor
            accounts={cashRows}
            onChange={setCashRows}
            currency="KRW"
            disabled={loading}
          />
        </section>

        {/* Memo */}
        <div className="px-6 pb-3">
          <span className="eyebrow">{t('additionalInfo')}</span>
        </div>
        <section className="mx-4 mb-4 p-4 bg-card border border-border">
          <label htmlFor="note" className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
            {t('memo')}
          </label>
          <input
            id="note"
            type="text"
            placeholder={t('memoPlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full mt-1.5 bg-transparent font-serif text-base md:text-[15px] text-foreground outline-none border-b border-border pb-1.5 placeholder:text-muted-foreground/60 focus:border-primary transition-colors"
          />
        </section>

        {/* Summary */}
        <div className="px-6 pb-3 flex items-center justify-between gap-2">
          <span className="eyebrow">{t('summary')}</span>
          <div className="inline-flex items-center border border-border">
            <button
              type="button"
              onClick={() => setSummaryDisplayCurrency('KRW')}
              className={cn(
                'text-[10px] font-bold tracking-wide px-2.5 py-1 transition-colors',
                summaryDisplayCurrency === 'KRW'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              ₩ KRW
            </button>
            <button
              type="button"
              onClick={() => setSummaryDisplayCurrency('USD')}
              className={cn(
                'text-[10px] font-bold tracking-wide px-2.5 py-1 transition-colors',
                summaryDisplayCurrency === 'USD'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              $ USD
            </button>
          </div>
        </div>

        <section className="mx-4 mb-4 p-5 bg-card border border-border">
          <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase">
            {t('totalValue')}
          </div>
          <div className="amount-display text-[28px] text-foreground leading-none mt-1.5">
            {formatCurrency(totals.totalValue, totals.currency)}
          </div>

          <div className="flex gap-4 mt-4 items-stretch">
            <div className="flex-1">
              <div className="text-[10px] font-bold text-muted-foreground tracking-[0.5px] uppercase">
                {t('returnRate')}
              </div>
              <div
                className={cn(
                  'text-[15px] font-bold mt-1 numeric inline-flex items-center gap-0.5',
                  isProfit ? 'text-profit' : 'text-loss',
                )}
              >
                <span aria-hidden>{isProfit ? '▲' : '▼'}</span>
                <span>{Math.abs(totals.profitRate).toFixed(2)}%</span>
              </div>
            </div>
            <div className="w-px bg-border self-stretch" />
            <div className="flex-1">
              <div className="text-[10px] font-bold text-muted-foreground tracking-[0.5px] uppercase">
                {t('pl')}
              </div>
              <div
                className={cn(
                  'text-[15px] font-bold mt-1 numeric',
                  isProfit ? 'text-profit' : 'text-loss',
                )}
              >
                {isProfit ? '+' : '-'}{formatCurrency(Math.abs(totals.profit), totals.currency)}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{t('totalInvested')}</span>
            <span className="font-bold text-foreground numeric">
              {formatCurrency(totals.totalCost, totals.currency)}
            </span>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-4 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-[12px]">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pt-2 flex gap-2">
          <Link href="/dashboard/snapshots" className="flex-1">
            <button
              type="button"
              className="w-full border border-border text-foreground py-3 text-sm font-bold hover:bg-accent-soft transition-colors"
            >
              {t('cancel')}
            </button>
          </Link>
          <button
            type="submit"
            disabled={loading || updatingPrices}
            className="flex-1 bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : updatingPrices
                ? (t('calculating') || 'Calculating...')
                : t('save')}
          </button>
        </div>
      </form>
      {/* 보유 종목 불러오기 확인 — native confirm() 대체 */}
      <ConfirmDialog
        open={loadConfirmOpen}
        onOpenChange={setLoadConfirmOpen}
        title={language === 'ko' ? '현재 보유 종목 불러오기' : 'Load current holdings'}
        description={t('loadCurrentHoldingsConfirm')}
        confirmLabel={language === 'ko' ? '불러오기' : 'Load'}
        cancelLabel={language === 'ko' ? '취소' : 'Cancel'}
        onConfirm={performLoadCurrentHoldings}
      />
    </div>
  )
}
