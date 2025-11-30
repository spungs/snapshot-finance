'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

interface PortfolioSummaryCardProps {
  totalValue: number
  totalCost: number
  totalProfit: number
  profitRate: number
  cashBalance: number
  holdingsCount: number
  snapshotDate?: string
}

import { useLanguage } from '@/lib/i18n/context'
import { Currency } from '@/lib/currency/context'

interface PortfolioSummaryCardProps {
  totalValue: number
  totalCost: number
  totalProfit: number
  profitRate: number
  cashBalance: number
  holdingsCount: number
  snapshotDate?: string
  baseCurrency?: Currency
  exchangeRate?: number
}

export function PortfolioSummaryCard({
  totalValue,
  totalCost,
  totalProfit,
  profitRate,
  cashBalance,
  holdingsCount,
  snapshotDate,
  baseCurrency = 'KRW',
  exchangeRate = 1435,
}: PortfolioSummaryCardProps) {
  const { t } = useLanguage()

  // Conversion helper
  const convert = (value: number) => {
    if (baseCurrency === 'KRW') return value // Assuming input is already in KRW (default behavior of existing code)
    return value / exchangeRate
  }

  // However, the input props might be in mixed or KRW. 
  // The existing logic in page.tsx calculates totals in KRW.
  // So we assume inputs are in KRW.

  const displayValue = convert(totalValue)
  const displayCost = convert(totalCost)
  const displayProfit = convert(totalProfit)
  const displayCash = convert(cashBalance)

  const isProfit = totalProfit >= 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>{t('portfolioSummary')}</span>
          {snapshotDate && (
            <span className="text-sm font-normal text-gray-500">
              {snapshotDate}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {/* 총 평가금액 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('totalValue')}</p>
            <p className="text-2xl font-bold">{formatCurrency(displayValue, baseCurrency)}</p>
          </div>

          {/* 총 매입금액 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('totalInvested')}</p>
            <p className="text-xl font-semibold text-gray-700">
              {formatCurrency(displayCost, baseCurrency)}
            </p>
          </div>

          {/* 평가손익 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('pl')}</p>
            <p
              className={cn(
                'text-xl font-bold',
                isProfit ? 'text-red-600' : 'text-blue-600'
              )}
            >
              {isProfit ? '+' : ''}
              {formatCurrency(displayProfit, baseCurrency)}
            </p>
          </div>

          {/* 수익률 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('returnRate')}</p>
            <p
              className={cn(
                'text-xl font-bold',
                isProfit ? 'text-red-600' : 'text-blue-600'
              )}
            >
              {formatProfitRate(profitRate)}
            </p>
          </div>

          {/* 예수금 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('cash')}</p>
            <p className="text-xl font-semibold text-gray-700">
              {formatCurrency(displayCash, baseCurrency)}
            </p>
          </div>

          {/* 보유 종목 수 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('holdings')}</p>
            <p className="text-xl font-semibold text-gray-700">
              {holdingsCount}{t('countUnit')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
