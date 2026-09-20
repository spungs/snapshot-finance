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
import { toPriceApiMarket, detectMarketCurrency } from '@/lib/utils/market-hours'
import { ArrowLeft, ClipboardPaste, Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SnapshotPasteDialog, type ResolvedPastedHolding } from '@/components/dashboard/snapshot-paste-dialog'
import {
  CashAccountEditor,
  type CashAccountRow,
  toEditorRows,
  fromEditorRows,
} from '@/components/dashboard/cash-account-editor'
import type { CashAccount } from '@/types/cash'

interface HoldingInput {
  stockName: string
  stockCode: string
  /** Stock.market 원본값 (KOSPI/KOSDAQ/NASD/NYSE/AMEX/LSE). 통화 판정과 시세 조회에 쓴다. */
  market: string
  quantity: string
  averagePrice: string
  currentPrice: string
  currency: 'KRW' | 'USD'
  purchaseRate: string
  /**
   * 'manual' 이면 사용자가 준 매입환율(시트 투자금액에서 역산 등) — 날짜를 바꿔도 보존한다.
   * 'auto' 면 스냅샷 시점 환율을 쓰는 기본값이라 날짜 변경 시 갱신한다.
   */
  purchaseRateSource: 'auto' | 'manual'
  /**
   * true 면 시세 조회에 실패해 붙여넣은 시트의 가격을 그대로 쓰고 있다는 뜻.
   * 시트의 "현재가"는 시트를 만든 시점 값이라 스냅샷 날짜의 종가가 아닐 수 있어
   * UI 에 반드시 표시한다.
   */
  priceFromSheet?: boolean
}

/**
 * 여러 종목의 가격을 배치 엔드포인트로 한 번에 조회한다.
 * 반환값은 stockCode → 가격. 조회 실패한 종목은 키가 없다(빈칸으로 남겨 사용자에게 알림).
 *
 * 종목마다 따로 요청하면 ratelimit(10req/10s)에 걸려 일부만 채워지고,
 * 가격 없는 행이 저장 시 조용히 빠지는 사고로 이어진다.
 */
async function fetchPricesBatch(
  targets: Array<{ stockCode: string; market: string }>,
  date: string | null,
  signal: AbortSignal,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (targets.length === 0) return out

  const res = await fetch('/api/stocks/prices/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      items: targets.map((t) => ({
        symbol: t.stockCode,
        market: toPriceApiMarket(t.market, t.stockCode),
      })),
    }),
    signal,
  })
  const data = await res.json()
  if (!data?.success) return out

  for (const [code, price] of Object.entries(data.data.prices as Record<string, number | null>)) {
    if (typeof price === 'number' && price > 0) out[code] = price
  }
  return out
}

/**
 * 휴장일이면 직전 거래일로 바꿔준다. 바뀌지 않았으면 입력 그대로 반환.
 *
 * 주말·공휴일·임시 폐장(2021-12-31 한국 증시 등)에 스냅샷을 만들면 그날 종가가 없어
 * 전 종목 조회가 실패하고, 값이 빈 채로 저장되거나 붙여넣은 시트 값이 그대로 남는다.
 */
async function resolveTradingDay(
  date: string,
  markets: string[],
  signal: AbortSignal,
): Promise<string> {
  if (markets.length === 0) return date
  try {
    const res = await fetch(
      `/api/stocks/trading-day?date=${date}&markets=${markets.join(',')}`,
      { signal },
    )
    const data = await res.json()
    if (data?.success && data.data?.resolved && data.data.tradingDay) {
      return data.data.tradingDay as string
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    console.error('Trading day lookup failed', e)
  }
  return date
}

export default function NewSnapshotPage() {
  const router = useRouter()
  const { t, language } = useLanguage()
  const today = new Date().toISOString().split('T')[0]
  const [snapshotDate, setSnapshotDate] = useState(today)
  const [holdings, setHoldings] = useState<HoldingInput[]>([
    { stockName: '', stockCode: '', market: '', quantity: '', averagePrice: '', currentPrice: '', currency: 'KRW', purchaseRate: '1', purchaseRateSource: 'auto' },
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
  // 해당 날짜의 환율을 못 받아왔을 때 true — 폴백 상수로 조용히 저장되는 것을 막는다.
  const [rateUnavailable, setRateUnavailable] = useState(false)
  // 휴장일이라 날짜를 직전 거래일로 옮겼을 때 사용자에게 알린다.
  const [adjustedFrom, setAdjustedFrom] = useState<string | null>(null)

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
      setRateUnavailable(false)
      try {
        // 0) 휴장일이면 직전 거래일로 옮긴다. 날짜가 바뀌면 이 effect 가 다시 돌면서
        //    바뀐 날짜로 환율·시세를 조회하므로 여기서는 바로 빠져나간다.
        if (snapshotDate !== today) {
          const markets = Array.from(new Set(
            holdings.filter(h => h.stockCode)
              .map(h => (toPriceApiMarket(h.market, h.stockCode) === 'US' ? 'US' : 'KR')),
          ))
          const resolved = await resolveTradingDay(snapshotDate, markets, controller.signal)
          if (controller.signal.aborted) return
          if (resolved !== snapshotDate) {
            setAdjustedFrom(snapshotDate)
            setSnapshotDate(resolved)
            return
          }
        }
        setAdjustedFrom(null)

        // 1) 환율 — 과거 날짜면 "그 날짜의" 환율을 조회한다.
        //    구버전은 /api/stocks/history?market=FX 를 썼는데, kis-client 의 US 분기가
        //    Yahoo → KIS 로 교체된 뒤 KRW=X 를 찾지 못해 항상 폴백 상수로 굳어졌다.
        let currentRate = FALLBACK_USD_RATE
        try {
          const url = snapshotDate === today
            ? '/api/exchange-rate'
            : `/api/exchange-rate?date=${snapshotDate}`
          const res = await fetch(url, { signal: controller.signal })
          const data = await res.json()
          if (controller.signal.aborted) return
          if (data.success && data.rate) {
            currentRate = data.rate
          } else {
            setRateUnavailable(true)
          }
        } catch (e) {
          if ((e as Error).name === 'AbortError') return
          setRateUnavailable(true)
        }
        setExchangeRate(currentRate)

        // 2) 종목 시세 — 배치 1회로 조회한다. 실패한 종목은 가격을 비워 두고,
        //    저장 시점에 사용자에게 명시적으로 알린다(조용히 제외하지 않는다).
        const targets = holdings.filter((h) => h.stockCode)
        if (targets.length > 0) {
          const priceByCode = await fetchPricesBatch(
            targets,
            snapshotDate === today ? null : snapshotDate,
            controller.signal,
          )
          if (controller.signal.aborted) return

          setHoldings((prev) => prev.map((h) => {
            if (!h.stockCode) return h
            const price = priceByCode[h.stockCode]
            const currency = detectMarketCurrency(h.market, h.stockCode)
            // 사용자가 준 매입환율(시트 역산 등)은 매입 시점 값이라 스냅샷 날짜와 무관 — 보존한다.
            const keepRate = h.purchaseRateSource === 'manual' && currency === 'USD'
            return {
              ...h,
              currentPrice: typeof price === 'number' ? price.toString() : '',
              priceFromSheet: false,
              currency,
              purchaseRate: keepRate
                ? h.purchaseRate
                : currency === 'USD' ? currentRate.toString() : '1',
            }
          }))
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        console.error('Failed to refresh snapshot data', e)
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
        stockName: '',
        stockCode: '',
        market: '',
        quantity: '',
        averagePrice: '',
        currentPrice: '',
        currency: 'KRW',
        purchaseRate: '1',
        purchaseRateSource: 'auto',
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

  async function handleStockSelect(index: number, stock: { stockCode: string; nameKo: string; stockName?: string; market?: string }) {
    const market = stock.market ?? ''
    // 통화는 즉시 확정한다. Stock.market 은 NASD/NYSE/AMEX 이므로 'US' 와 직접 비교하면
    // 미국 종목이 전부 KRW 로 기록된다 (환산 없이 $ 금액이 원화로 저장되는 사고).
    const newCurrency = detectMarketCurrency(market, stock.stockCode)
    const newPurchaseRate = newCurrency === 'USD' ? exchangeRate.toString() : '1'

    const updated = [...holdings]
    updated[index] = {
      ...updated[index],
      stockName: stock.stockName ?? stock.nameKo,
      stockCode: stock.stockCode,
      market,
      currency: newCurrency,
      purchaseRate: newPurchaseRate,
      purchaseRateSource: 'auto',
    }
    setHoldings(updated)

    const controller = new AbortController()
    stockSelectAbortsRef.current.add(controller)

    try {
      const priceByCode = await fetchPricesBatch(
        [{ stockCode: stock.stockCode, market }],
        snapshotDate === today ? null : snapshotDate,
        controller.signal,
      )
      const price = priceByCode[stock.stockCode]

      if (controller.signal.aborted) return

      setHoldings((prev) => {
        const current = [...prev]
        if (!current[index] || current[index].stockCode !== stock.stockCode) return prev

        current[index] = {
          ...current[index],
          currentPrice: typeof price === 'number' ? price.toString() : '',
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

  // 스프레드시트 붙여넣기
  const [pasteOpen, setPasteOpen] = useState(false)

  /**
   * 붙여넣기로 해석된 종목들로 목록을 교체한다.
   * 시트에 현재가가 있으면 그대로 쓰고(조회 실패해도 값이 남는다), 없으면 배치로 채운다.
   */
  function applyPastedHoldings(rows: ResolvedPastedHolding[]) {
    const mapped: HoldingInput[] = rows.map((r) => ({
      stockName: r.stockName,
      stockCode: r.stockCode,
      market: r.market,
      quantity: r.quantity.toString(),
      averagePrice: r.averagePrice.toString(),
      currentPrice: r.currentPrice !== undefined ? r.currentPrice.toString() : '',
      currency: r.currency,
      purchaseRate: r.purchaseRate !== undefined
        ? r.purchaseRate.toString()
        : r.currency === 'USD' ? exchangeRate.toString() : '1',
      purchaseRateSource: r.purchaseRate !== undefined ? 'manual' : 'auto',
    }))
    setHoldings(mapped)
    setError(null)

    // 시트의 "현재가"는 시트를 만든 시점의 값이라 스냅샷 날짜의 종가라는 보장이 없다.
    // (과거 날짜 스냅샷에 오늘 시세가 박혀 수익률이 통째로 어긋난 사고가 있었다.)
    // 그래서 값이 있어도 **항상** 스냅샷 날짜 기준으로 다시 조회하고,
    // 조회에 실패한 종목만 시트 값을 남기되 priceFromSheet 로 표시한다.
    const targets = mapped.filter((h) => h.stockCode)
    if (targets.length === 0) return

    const controller = new AbortController()
    dateChangeAbortRef.current?.abort()
    dateChangeAbortRef.current = controller
    setUpdatingPrices(true)
    fetchPricesBatch(targets, snapshotDate === today ? null : snapshotDate, controller.signal)
      .then((priceByCode) => {
        if (controller.signal.aborted) return
        setHoldings((prev) => prev.map((h) => {
          if (!h.stockCode) return h
          const price = priceByCode[h.stockCode]
          if (typeof price === 'number') {
            return { ...h, currentPrice: price.toString(), priceFromSheet: false }
          }
          // 조회 실패 — 시트 값이라도 남겨 사용자가 고칠 수 있게 하고, 출처를 표시한다.
          return { ...h, priceFromSheet: Boolean(h.currentPrice) }
        }))
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') console.error('Failed to fetch pasted prices', e)
      })
      .finally(() => {
        if (!controller.signal.aborted) setUpdatingPrices(false)
      })
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
            stockName: h.stockName,
            stockCode: h.stockCode,
            market: h.market ?? '',
            quantity: h.quantity.toString(),
            averagePrice: h.averagePrice.toString(),
            currentPrice: h.currentPrice.toString(),
            currency,
            purchaseRate,
            // Holding 에 저장된 매입환율은 실제 매입 시점 값 — 날짜를 바꿔도 유지한다.
            purchaseRateSource: (currency === 'USD' && rawPurchaseRate && rawPurchaseRate !== '1'
              ? 'manual'
              : 'auto') as 'auto' | 'manual',
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

    // 종목이 선택된 행은 전부 저장 대상이다. 값이 빈 행을 말없이 걸러내면
    // "16종목 입력했는데 7종목만 저장" 같은 유실이 사용자 모르게 일어난다.
    const selected = holdings.filter((h) => h.stockCode)

    if (selected.length === 0) {
      setError(t('searchError'))
      return
    }

    const incomplete = selected.filter(
      (h) =>
        !(parseFloat(h.quantity) > 0) ||
        !(parseFloat(h.averagePrice) > 0) ||
        !(parseFloat(h.currentPrice) > 0),
    )

    if (incomplete.length > 0) {
      const names = incomplete.map((h) => h.stockName || h.stockCode).join(', ')
      setError(
        language === 'ko'
          ? `${incomplete.length}개 종목의 수량·평단가·가격이 비어 있습니다: ${names}`
          : `${incomplete.length} holding(s) missing quantity, average price, or price: ${names}`,
      )
      return
    }

    const validHoldings = selected

    setLoading(true)

    try {
      const cashAccountsPayload = fromEditorRows(cashRows, 'KRW', exchangeRate)
      const response = await snapshotsApi.create({
        snapshotDate,
        exchangeRate,
        holdings: validHoldings.map((h) => ({
          stockCode: h.stockCode,
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
          className="text-[12px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          {t('snapshots')}
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            disabled={loading || updatingPrices}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-primary px-2.5 py-1.5 hover:bg-accent-soft transition-colors disabled:opacity-50"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            {language === 'ko' ? '붙여넣기' : 'Paste'}
          </button>
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
              <p className="text-xs font-medium text-muted-foreground">
                {t('calculating') || 'Loading...'}
              </p>
            </div>
          </div>
        )}

        {/* Date card */}
        <section className="mx-4 mb-4 p-5 bg-card rounded-2xl">
          <div className="eyebrow mb-2">
            {t('snapshotDate') || 'Snapshot Date'}
          </div>
          <input
            type="date"
            max={today}
            value={snapshotDate}
            onChange={(e) => setSnapshotDate(e.target.value)}
            className="w-full bg-transparent text-[22px] font-semibold text-foreground numeric outline-none border-b border-border pb-1.5 focus:border-primary transition-colors"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {t('exchangeRate')}
            </span>
            <span className="text-[12px] font-bold text-foreground numeric">
              {formatCurrency(exchangeRate, 'KRW')} / USD
              {rateUnavailable && (
                <span className="ml-1.5 font-medium text-muted-foreground">
                  ({language === 'ko' ? '조회 실패, 기본값' : 'fallback'})
                </span>
              )}
            </span>
          </div>
          {adjustedFrom && (
            <div className="mt-3 pt-3 border-t border-border text-[11px] text-primary leading-relaxed">
              {language === 'ko'
                ? `${adjustedFrom}은 휴장일이라 직전 거래일 ${snapshotDate}로 맞췄습니다.`
                : `${adjustedFrom} was a market holiday — adjusted to the previous trading day ${snapshotDate}.`}
            </div>
          )}
          {isHistorical && !adjustedFrom && (
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
                className="bg-card rounded-2xl p-4"
                style={{ borderLeftWidth: '3px', borderLeftColor: holding.stockCode ? 'var(--primary)' : 'var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[13px] font-medium text-muted-foreground">
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

                {holding.stockCode && (holding.currentPrice ? (
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground">
                      {priceLabel}
                      {holding.priceFromSheet && (
                        <span className="ml-1 text-primary">
                          · {language === 'ko' ? '조회 실패, 붙여넣은 값' : 'lookup failed, pasted value'}
                        </span>
                      )}
                    </span>
                    <span className="font-bold text-foreground numeric">
                      {formatCurrency(parseFloat(holding.currentPrice) || 0, holding.currency)}
                    </span>
                  </div>
                ) : (
                  /* 시세 조회 실패 — 빈 채로 두면 저장 시 이 종목이 빠진다. 직접 입력받는다. */
                  <div className="mt-2">
                    <FormattedNumberInput
                      label={`${priceLabel} · ${language === 'ko' ? '조회 실패, 직접 입력' : 'not found, enter manually'}`}
                      prefix={isUS ? '$' : '₩'}
                      value={holding.currentPrice}
                      onChange={(val) => updateHolding(index, 'currentPrice', val)}
                    />
                  </div>
                ))}

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
        <section className="mx-4 mb-4 p-4 bg-card rounded-2xl">
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
        <section className="mx-4 mb-4 p-4 bg-card rounded-2xl">
          <label htmlFor="note" className="text-[13px] font-medium text-muted-foreground">
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

        <section className="mx-4 mb-4 p-5 bg-card rounded-2xl">
          <div className="text-[13px] font-medium text-muted-foreground">
            {t('totalValue')}
          </div>
          <div className="amount-display text-[28px] text-foreground leading-none mt-1.5">
            {formatCurrency(totals.totalValue, totals.currency)}
          </div>

          <div className="flex gap-4 mt-4 items-stretch">
            <div className="flex-1">
              <div className="text-[13px] font-medium text-muted-foreground">
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
              <div className="text-[13px] font-medium text-muted-foreground">
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
      <SnapshotPasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onApply={applyPastedHoldings}
      />
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
