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
}

// Removed duplicate useLanguage import if it exists below, but looking at file content it was at line 36.
// Merged into top block.

export function HoldingsTable({ holdings, exchangeRate }: HoldingsTableProps) {
  const { t } = useLanguage()

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
        // @ts-ignore - dynamic key access
        return (Number(a[key]) - Number(b[key])) * modifier
      })
    }

    return result
  }, [holdings, filterConfig, sortConfig])

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
            <span className="text-sm font-medium">필터:</span>
          </div>

          <Select
            value={filterConfig.market}
            onValueChange={(val: any) => setFilterConfig(prev => ({ ...prev, market: val }))}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder="시장" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 시장</SelectItem>
              <SelectItem value="US">미국(US)</SelectItem>
              <SelectItem value="KR">한국(KR)</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterConfig.profitStatus}
            onValueChange={(val: any) => setFilterConfig(prev => ({ ...prev, profitStatus: val }))}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder="수익 상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 수익</SelectItem>
              <SelectItem value="plus">수익 (+)</SelectItem>
              <SelectItem value="minus">손실 (-)</SelectItem>
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
                필터 초기화
              </Button>
            )}
            {sortConfig.key !== null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2"
                onClick={() => setSortConfig({ key: null, direction: 'asc' })}
              >
                정렬 초기화
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredHoldings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {holdings.length === 0 ? t('holdingsEmpty') : "필터 조건에 맞는 종목이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHoldings.map((holding) => {
                    const isProfit = Number(holding.profit) >= 0
                    const currency = holding.currency || 'KRW'
                    return (
                      <TableRow key={holding.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{holding.stock.stockName}</p>
                            <p className="text-sm text-gray-500">
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
                            {currency === 'USD' && exchangeRate && (
                              <span className="text-xs text-muted-foreground">
                                {formatCurrency(Number(holding.totalCost) * exchangeRate, 'KRW')}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <div className="flex flex-col items-end">
                            <span>{formatCurrency(Number(holding.currentValue), currency)}</span>
                            {currency === 'USD' && exchangeRate && (
                              <span className="text-xs text-muted-foreground">
                                {formatCurrency(Number(holding.currentValue) * exchangeRate, 'KRW')}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-medium',
                            isProfit ? 'text-red-600' : 'text-blue-600'
                          )}
                        >
                          <div className="flex flex-col items-end">
                            <span>{formatCurrency(Math.abs(Number(holding.profit)), currency)}</span>
                            {currency === 'USD' && exchangeRate && (
                              <span className="text-xs opacity-80">
                                {formatCurrency(Math.abs(Number(holding.profit) * exchangeRate), 'KRW')}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-bold',
                            isProfit ? 'text-red-600' : 'text-blue-600'
                          )}
                        >
                          {formatProfitRate(Number(holding.profitRate))}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
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
