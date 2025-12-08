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

import { useLanguage } from '@/lib/i18n/context'

export function HoldingsTable({ holdings, exchangeRate }: HoldingsTableProps) {
  const { t } = useLanguage()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('holdings')}</CardTitle>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('holdingsEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-[700px] px-4 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('stockName')}</TableHead>
                    <TableHead className="text-right">{t('quantity')}</TableHead>
                    <TableHead className="text-right">{t('avgPrice')}</TableHead>
                    <TableHead className="text-right">{t('currentPrice')}</TableHead>
                    <TableHead className="text-right">{t('totalCost')}</TableHead>
                    <TableHead className="text-right">{t('evaluatedValue')}</TableHead>
                    <TableHead className="text-right">{t('pl')}</TableHead>
                    <TableHead className="text-right">{t('returnRate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((holding) => {
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
