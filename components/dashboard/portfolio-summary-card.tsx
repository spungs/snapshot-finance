'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

import { useLanguage } from '@/lib/i18n/context'
import { Currency } from '@/lib/currency/context'

interface PortfolioSummaryCardProps {
  totalValue: number
  totalCost: number
  totalProfit: number
  profitRate: number
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {/* 총 평가금액 */}
          <div>
            <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('totalValue')}</p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(displayValue, baseCurrency)}</p>
          </div>

          {/* 총 매입금액 */}
          <div>
            <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('totalInvested')}</p>
            <p className="text-lg sm:text-xl font-semibold text-gray-700">
              {formatCurrency(displayCost, baseCurrency)}
            </p>
          </div>

          {/* 평가손익 */}
          <div>
            <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('pl')}</p>
            <p
              className={cn(
                'text-lg sm:text-xl font-bold',
                isProfit ? 'text-red-600' : 'text-blue-600'
              )}
            >
              {formatCurrency(Math.abs(displayProfit), baseCurrency)}
            </p>
          </div>

          {/* 수익률 */}
          <div>
            <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('returnRate')}</p>
            <p
              className={cn(
                'text-lg sm:text-xl font-bold',
                isProfit ? 'text-red-600' : 'text-blue-600'
              )}
            >
              {formatProfitRate(profitRate)}
            </p>
          </div>

          {/* 보유 종목 수 */}
          <div>
            <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('holdings')}</p>
            <p className="text-lg sm:text-xl font-semibold text-gray-700">
              {holdingsCount}{t('countUnit')}
            </p>
          </div>
        </div>

        {/* 환율 표시 (KRW일 때) */}
        {baseCurrency === 'KRW' && exchangeRate && (
          <div className="mt-4 pt-4 border-t text-sm text-right text-muted-foreground">
            {t('appliedExchangeRate')}: 1 USD = {formatCurrency(exchangeRate, 'KRW')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
