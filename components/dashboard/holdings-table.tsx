'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatNumber, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'

type SortKey = 'stockName' | 'quantity' | 'averagePrice' | 'currentPrice' | 'totalCost' | 'currentValue' | 'profit' | 'profitRate'
type SortDirection = 'asc' | 'desc'

interface SortConfig {
  key: SortKey | null
  direction: SortDirection
}

interface FilterConfig {
  market: 'all' | 'US' | 'KR'
  profitStatus: 'all' | 'plus' | 'minus'
}

interface Holding {
  id: string
  stock: {
    stockCode: string
    stockName: string
  }
  quantity: number
  averagePrice: number
  currentPrice: number
  totalCost: number
  currentValue: number
  profit: number
  profitRate: number
  currency?: string
}

interface HoldingsTableProps {
  holdings: Holding[]
  exchangeRate?: number
  totalValue?: number
}

// Removed duplicate useLanguage import if it exists below, but looking at file content it was at line 36.
// Merged into top block.

export function HoldingsTable({ holdings, exchangeRate, totalValue: propTotalValue }: HoldingsTableProps) {
  const { t, language } = useLanguage()

  // State
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' })
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({ market: 'all', profitStatus: 'all' })

  // Handlers
  const handleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: key === 'stockName' ? 'asc' : 'desc' }
    })
  }

  // Derived State
  const filteredHoldings = useMemo(() => {
    let result = [...holdings]

    // 1. Filter
    if (filterConfig.market !== 'all') {
      // Infer market from stockCode or currency? 
      // Snapshot holdings usually have currency. US=USD, KR=KRW.
      // Or we can check stockCode pattern?
      // Let's rely on currency since we have it.
      result = result.filter(h => {
        if (filterConfig.market === 'US') return h.currency === 'USD'
        if (filterConfig.market === 'KR') return h.currency === 'KRW'
        return true
      })
    }
    if (filterConfig.profitStatus !== 'all') {
      result = result.filter(h => {
        if (filterConfig.profitStatus === 'plus') return h.profit >= 0
        if (filterConfig.profitStatus === 'minus') return h.profit < 0
        return true
      })
    }

    // 2. Sort
    if (sortConfig.key) {
      result.sort((a, b) => {
        const { key, direction } = sortConfig
        const modifier = direction === 'asc' ? 1 : -1

        if (key === 'stockName') {
          return a.stock.stockName.localeCompare(b.stock.stockName) * modifier
        }

        // Numeric sort
        const valA = Number(a[key as keyof Holding] || 0)
        const valB = Number(b[key as keyof Holding] || 0)
        return (valA - valB) * modifier
      })
    }

    return result
  }, [holdings, filterConfig, sortConfig])

  // Calculate Total Value if not provided (fallback)
  const totalValue = propTotalValue || holdings.reduce((sum, h) => sum + Number(h.currentValue), 0)

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <CardTitle>{t('holdings')} ({filteredHoldings.length})</CardTitle>
        </div>

        {/* 필터 및 정렬 컨트롤 */}
        <div className="flex flex-wrap gap-3 p-1 bg-muted/30 rounded-lg items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('filter')}:</span>
          </div>

          <Select
            value={filterConfig.market}
            onValueChange={(val: any) => setFilterConfig(prev => ({ ...prev, market: val }))}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder={t('market')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('marketAll')}</SelectItem>
              <SelectItem value="US">{t('marketUS')}</SelectItem>
              <SelectItem value="KR">{t('marketKR')}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterConfig.profitStatus}
            onValueChange={(val: any) => setFilterConfig(prev => ({ ...prev, profitStatus: val }))}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder={t('profitStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('statusAll')}</SelectItem>
              <SelectItem value="plus">{t('statusPlus')}</SelectItem>
              <SelectItem value="minus">{t('statusMinus')}</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            {(filterConfig.market !== 'all' || filterConfig.profitStatus !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2"
                onClick={() => setFilterConfig({ market: 'all', profitStatus: 'all' })}
              >
                {t('resetFilter')}
              </Button>
            )}
            {sortConfig.key !== null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2"
                onClick={() => setSortConfig({ key: null, direction: 'asc' })}
              >
                {t('resetSort')}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredHoldings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {holdings.length === 0 ? t('holdingsEmpty') : t('filterEmpty')}
          </div>
        ) : (
          <>
            {/* Mobile View: Cards */}
            <div className="md:hidden space-y-4">
              {filteredHoldings.map((holding) => {
                const isProfit = Number(holding.profit) >= 0
                const currency = holding.currency || 'KRW'
                return (
                  <div key={holding.id} className="bg-muted/40 rounded-lg p-4 border space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-lg">{holding.stock.stockName}</div>
                        <div className="text-sm text-muted-foreground">{holding.stock.stockCode}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">{t('quantity')}</div>
                        <div className="font-medium">{formatNumber(holding.quantity)}{t('countUnit')}</div>
                      </div>
                    </div>



                    <div className="grid grid-cols-2 gap-4 border-t pt-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">{t('avgPrice')}</div>
                        <div className="font-medium">{formatCurrency(Number(holding.averagePrice), currency)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1">{t('currentPrice')}</div>
                        <div className="font-medium">{formatCurrency(Number(holding.currentPrice), currency)}</div>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">{t('totalCost')}</div>
                        <div className="font-medium">{formatCurrency(Number(holding.totalCost), currency)}</div>
                        {currency === 'USD' && exchangeRate && language === 'ko' && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatCurrency(Number(holding.totalCost) * exchangeRate, 'KRW')}
                          </div>
                        )}
                        {(currency === 'KRW' || !currency) && exchangeRate && language === 'en' && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatCurrency(Number(holding.totalCost) / exchangeRate, 'USD')}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1">{t('evaluatedValue')}</div>
                        <div className="font-medium">{formatCurrency(Number(holding.currentValue), currency)}</div>
                        {currency === 'USD' && exchangeRate && language === 'ko' && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatCurrency(Number(holding.currentValue) * exchangeRate, 'KRW')}
                          </div>
                        )}
                        {(currency === 'KRW' || !currency) && exchangeRate && language === 'en' && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatCurrency(Number(holding.currentValue) / exchangeRate, 'USD')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-background p-3 rounded border">
                      <div>
                        <div className="text-xs text-muted-foreground">{t('pl')}</div>
                        <div className={cn(
                          "font-medium",
                          isProfit ? 'text-profit' : 'text-loss'
                        )}>
                          {isProfit ? '+' : ''}{formatCurrency(Number(holding.profit), currency)}
                        </div>
                        {currency === 'USD' && exchangeRate && language === 'ko' && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            ({isProfit ? '+' : ''}{formatCurrency(Number(holding.profit) * exchangeRate, 'KRW')})
                          </div>
                        )}
                        {(currency === 'KRW' || !currency) && exchangeRate && language === 'en' && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            ({isProfit ? '+' : ''}{formatCurrency(Number(holding.profit) / exchangeRate, 'USD')})
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{t('returnRate')}</div>
                        <div className={cn(
                          "font-bold text-lg",
                          isProfit ? 'text-profit' : 'text-loss'
                        )}>
                          <div className="flex items-center justify-end gap-1">
                            <span>{formatProfitRate(Number(holding.profitRate), true)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center border-t pt-3 mt-3 border-border/50">
                      <div className="text-sm font-medium">{t('weight')}</div>
                      <div className="font-bold text-foreground">
                        {formatNumber(totalValue ? ((holding.currency === 'USD' && exchangeRate ? Number(holding.currentValue) * exchangeRate : Number(holding.currentValue)) / totalValue) * 100 : 0, 1)}%
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-[700px] px-4 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader label={t('stockName')} sortKey="stockName" currentSort={sortConfig} onSort={handleSort} />

                      <SortableHeader label={t('quantity')} sortKey="quantity" align="right" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label={t('avgPrice')} sortKey="averagePrice" align="right" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label={t('currentPrice')} sortKey="currentPrice" align="right" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label={t('totalCost')} sortKey="totalCost" align="right" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label={t('evaluatedValue')} sortKey="currentValue" align="right" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label={t('pl')} sortKey="profit" align="right" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label={t('returnRate')} sortKey="profitRate" align="right" currentSort={sortConfig} onSort={handleSort} />
                      <TableHead className="text-right">{t('weight')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHoldings.map((holding) => {
                      const isProfit = Number(holding.profit) >= 0
                      const currency = holding.currency || 'KRW'
                      const weight = totalValue
                        ? ((holding.currency === 'USD' && exchangeRate
                            ? Number(holding.currentValue) * exchangeRate
                            : Number(holding.currentValue)) / totalValue) * 100
                        : 0
                      return (
                        <TableRow key={holding.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{holding.stock.stockName}</p>
                              <p className="text-sm text-muted-foreground">
                                {holding.stock.stockCode}
                              </p>
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            {formatNumber(holding.quantity)}{t('countUnit')}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(Number(holding.averagePrice), currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(Number(holding.currentPrice), currency)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <div className="flex flex-col items-end">
                              <span>{formatCurrency(Number(holding.totalCost), currency)}</span>
                              {currency === 'USD' && exchangeRate && language === 'ko' && (
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(Number(holding.totalCost) * exchangeRate, 'KRW')}
                                </span>
                              )}
                              {(currency === 'KRW' || !currency) && exchangeRate && language === 'en' && (
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(Number(holding.totalCost) / exchangeRate, 'USD')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <div className="flex flex-col items-end">
                              <span>{formatCurrency(Number(holding.currentValue), currency)}</span>
                              {currency === 'USD' && exchangeRate && language === 'ko' && (
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(Number(holding.currentValue) * exchangeRate, 'KRW')}
                                </span>
                              )}
                              {(currency === 'KRW' || !currency) && exchangeRate && language === 'en' && (
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(Number(holding.currentValue) / exchangeRate, 'USD')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-medium',
                              isProfit ? 'text-profit' : 'text-loss'
                            )}
                          >
                            <div className="flex flex-col items-end">
                              <span>{isProfit ? '+' : ''}{formatCurrency(Number(holding.profit), currency)}</span>
                              {currency === 'USD' && exchangeRate && language === 'ko' && (
                                <span className="text-xs opacity-80">
                                  ({isProfit ? '+' : ''}{formatCurrency(Number(holding.profit) * exchangeRate, 'KRW')})
                                </span>
                              )}
                              {(currency === 'KRW' || !currency) && exchangeRate && language === 'en' && (
                                <span className="text-xs opacity-80">
                                  ({isProfit ? '+' : ''}{formatCurrency(Number(holding.profit) / exchangeRate, 'USD')})
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-bold',
                              isProfit ? 'text-profit' : 'text-loss'
                            )}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>{formatProfitRate(Number(holding.profitRate), true)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1.5">
                              <span className="text-xs numeric text-foreground">{formatNumber(weight, 1)}%</span>
                              <div className="w-14 h-[3px] bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary/70 rounded-full"
                                  style={{ width: `${Math.min(weight, 100)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  align = 'left'
}: {
  label: string,
  sortKey: SortKey,
  currentSort: SortConfig,
  onSort: (key: SortKey) => void,
  align?: 'left' | 'right'
}) {
  const isActive = currentSort.key === sortKey
  return (
    <TableHead
      className={cn(
        "cursor-pointer hover:bg-muted/50 transition-colors select-none",
        align === 'right' ? "text-right" : "text-left",
        isActive && "text-primary font-bold"
      )}
      onClick={() => onSort(sortKey)}
    >
      <div className={cn("flex items-center gap-1", align === 'right' && "justify-end")}>
        {label}
        {isActive ? (
          currentSort.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </TableHead>
  )
}
