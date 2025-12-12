'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

import { useLanguage } from '@/lib/i18n/context'
import { Currency, useCurrency } from '@/lib/currency/context'
import { CashBalanceDialog } from './cash-balance-dialog'

interface PortfolioSummaryCardProps {
  totalValue: number
  totalCost: number
  totalProfit: number
  profitRate: number
  holdingsCount: number
  snapshotDate?: string
  baseCurrency?: Currency
  exchangeRate?: number
  cashBalance?: number
  totalStockValue?: number
  isEditable?: boolean
}

export function PortfolioSummaryCard({
  totalValue,
  totalCost,
  totalProfit,
  profitRate,
  holdingsCount,
  snapshotDate,
  baseCurrency, // Now optional in destructuring, but we need to handle default from context
  exchangeRate = 1435,
  isEditable = false,
  ...props
}: PortfolioSummaryCardProps) {
  const { t } = useLanguage()
  const { baseCurrency: contextBaseCurrency } = useCurrency()

  const currency = baseCurrency || contextBaseCurrency

  // Conversion helper
  const convert = (value: number) => {
    // If target currency is KRW, and input is KRW (assumed), no conversion.
    // If target is USD, divide by rate.
    if (currency === 'KRW') return value
    return value / exchangeRate
  }

  const displayValue = convert(totalValue)
  const displayStockValue = convert(props.totalStockValue || (totalValue - (props.cashBalance || 0)))
  const displayCash = convert(props.cashBalance || 0)
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* 총 자산 */}
          <div className="lg:col-span-1">
            <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('totalValue')}</p>
            <p className="text-xl sm:text-2xl font-bold text-primary">{formatCurrency(displayValue, currency)}</p>
          </div>

          {/* 자산 구성 (주식/현금) */}
          <div>
            <p className="text-xs text-gray-500 mb-1">{t('stockValue')}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-lg font-semibold">{formatCurrency(displayStockValue, currency)}</p>
              {displayValue > 0 && (
                <span className="text-sm text-muted-foreground">
                  ({((displayStockValue / displayValue) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-gray-500">{t('cash')}</p>
              {isEditable && (
                <CashBalanceDialog
                  initialBalance={props.cashBalance || 0}
                  currency={currency}
                  exchangeRate={exchangeRate}
                />
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-lg font-semibold">{formatCurrency(displayCash, currency)}</p>
              {displayValue > 0 && (
                <span className="text-sm text-muted-foreground">
                  ({((displayCash / displayValue) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">{t('holdings')}</p>
            <p className="text-lg font-semibold">{holdingsCount}{t('countUnit')}</p>
          </div>
        </div>

        <div className="col-span-full border-t pt-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* 총 매입금액 */}
            <div className="lg:col-span-1">
              <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('totalInvested')}</p>
              <p className="text-lg font-semibold text-gray-700">
                {formatCurrency(displayCost, currency)}
              </p>
            </div>

            {/* 평가손익 (투자) */}
            <div>
              <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('plInvest')}</p>
              <p
                className={cn(
                  'text-lg font-bold',
                  isProfit ? 'text-red-600' : 'text-blue-600'
                )}
              >
                {formatCurrency(Math.abs(displayProfit), currency)}
              </p>
            </div>

            {/* 수익률 */}
            <div>
              <p className="text-xs sm:text-sm text-gray-500 mb-1">{t('returnRate')}</p>
              <p
                className={cn(
                  'text-lg font-bold',
                  isProfit ? 'text-red-600' : 'text-blue-600'
                )}
              >
                {formatProfitRate(profitRate)}
              </p>
            </div>

            {/* Empty slot to maintain alignment with Holdings column */}
            <div className="hidden lg:block" />
          </div>
        </div>

        {/* 환율 표시 (KRW일 때) */}
        {currency === 'KRW' && exchangeRate && (
          <div className="mt-4 pt-4 border-t text-sm text-right text-muted-foreground">
            {t('appliedExchangeRate')}: 1 USD = {formatCurrency(exchangeRate, 'KRW')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
