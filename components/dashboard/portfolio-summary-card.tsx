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

export function PortfolioSummaryCard({
  totalValue,
  totalCost,
  totalProfit,
  profitRate,
  cashBalance,
  holdingsCount,
  snapshotDate,
}: PortfolioSummaryCardProps) {
  const isProfit = totalProfit >= 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>포트폴리오 요약</span>
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
            <p className="text-sm text-gray-500 mb-1">총 평가금액</p>
            <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
          </div>

          {/* 총 매입금액 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">총 매입금액</p>
            <p className="text-xl font-semibold text-gray-700">
              {formatCurrency(totalCost)}
            </p>
          </div>

          {/* 평가손익 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">평가손익</p>
            <p
              className={cn(
                'text-xl font-bold',
                isProfit ? 'text-red-600' : 'text-blue-600'
              )}
            >
              {isProfit ? '+' : ''}
              {formatCurrency(totalProfit)}
            </p>
          </div>

          {/* 수익률 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">수익률</p>
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
            <p className="text-sm text-gray-500 mb-1">예수금</p>
            <p className="text-xl font-semibold text-gray-700">
              {formatCurrency(cashBalance)}
            </p>
          </div>

          {/* 보유 종목 수 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">보유 종목</p>
            <p className="text-xl font-semibold text-gray-700">
              {holdingsCount}개
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
