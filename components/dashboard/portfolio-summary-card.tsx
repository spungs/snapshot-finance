'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

import { useLanguage } from '@/lib/i18n/context'
import { Currency, useCurrency } from '@/lib/currency/context'
import { CashBalanceDialog } from './cash-balance-dialog'
import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'

import { TargetAssetDialog } from './target-asset-dialog'
import { Progress } from '@/components/ui/progress'

import confetti from 'canvas-confetti'
import { useEffect, useRef, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface PortfolioSummaryCardProps {
  // ... existing props
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
  targetAsset?: number
  isEditable?: boolean
}

export function PortfolioSummaryCard({
  totalValue,
  totalCost,
  totalProfit,
  profitRate,
  holdingsCount,
  snapshotDate,
  baseCurrency,
  exchangeRate = 1435,
  isEditable = false,
  targetAsset = 0,
  ...props
}: PortfolioSummaryCardProps) {
  const { t } = useLanguage()
  const { baseCurrency: contextBaseCurrency } = useCurrency()
  const [interestRate, setInterestRate] = useLocalStorage('interestRate', 3)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh()
    })
  }

  const currency = baseCurrency || contextBaseCurrency

  // Conversion helper
  const convert = (value: number) => {
    if (currency === 'KRW') return value
    return value / exchangeRate
  }

  const displayValue = convert(totalValue)
  const displayStockValue = convert(props.totalStockValue || (totalValue - (props.cashBalance || 0)))
  const displayCash = convert(props.cashBalance || 0)
  const displayCost = convert(totalCost)
  const displayProfit = convert(totalProfit)
  const displayTarget = convert(targetAsset)

  const achievementRate = displayTarget > 0 ? (displayValue / displayTarget) * 100 : 0
  const isGoalAchieved = achievementRate >= 100 && displayTarget > 0
  const hasTriggeredRef = useRef(false)

  useEffect(() => {
    if (isGoalAchieved && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true
      const duration = 3 * 1000
      const animationEnd = Date.now() + duration
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

      const interval: any = setInterval(function () {
        const timeLeft = animationEnd - Date.now()

        if (timeLeft <= 0) {
          return clearInterval(interval)
        }

        const particleCount = 50 * (timeLeft / duration)

        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        })
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        })
      }, 250)
    }
  }, [isGoalAchieved])


  const isProfit = totalProfit >= 0

  return (
    <Card>
      {/* Goal Achieved Banner */}
      {isGoalAchieved && (
        <div className="bg-primary/10 text-primary px-6 py-3 text-sm font-medium flex justify-between items-center border-b border-primary/20 -mt-6 rounded-t-xl mb-4">
          <span className="flex items-center gap-2">
            🎉 {t('goalAchieved')}
          </span>
          {isEditable && (
            <TargetAssetDialog
              initialTarget={targetAsset}
              currency={currency}
              exchangeRate={exchangeRate}
              isGlobalBusy={isPending}
              onRefresh={handleRefresh}
              trigger={
                <Button size="sm" variant="default" className="h-8 text-xs">
                  {t('setNewGoal')}
                </Button>
              }
            />
          )}
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>{t('portfolioSummary')}</span>
          {snapshotDate && (
            <span className="text-sm font-normal text-muted-foreground">
              {snapshotDate}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* 총 자산 */}
          <div className="lg:col-span-1">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t('totalValue')}</p>
            <p className="text-xl sm:text-2xl font-bold text-primary">{formatCurrency(displayValue, currency)}</p>
          </div>

          {/* 자산 구성 (주식/현금) */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('stockValue')}</p>
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
              <p className="text-xs text-muted-foreground">{t('cash')}</p>
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
            <p className="text-xs text-muted-foreground mb-1">{t('holdings')}</p>
            <p className="text-lg font-semibold">{holdingsCount}{t('countUnit')}</p>
          </div>
        </div>

        {/* 목표 자산 & 달성률 */}
        <div className="mt-6 mb-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">{t('achievementRate')}</span>
              <span className="text-sm font-bold text-primary">{achievementRate.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t('targetAsset')}: {formatCurrency(displayTarget, currency)}
              </span>
              {isEditable && (
                <TargetAssetDialog
                  initialTarget={targetAsset}
                  currency={currency}
                  exchangeRate={exchangeRate}
                  isGlobalBusy={isPending}
                  onRefresh={handleRefresh}
                />
              )}
            </div>
          </div>
          <Progress value={Math.min(achievementRate, 100)} className="h-2" />
        </div>

        <div className="col-span-full border-t border-border pt-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* 총 매입금액 */}
            <div className="lg:col-span-1">
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t('totalInvested')}</p>
              <p className="text-lg font-semibold text-foreground">
                {formatCurrency(displayCost, currency)}
              </p>
            </div>

            {/* 평가손익 (투자) */}
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t('plInvest')}</p>
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
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t('returnRate')}</p>
              <p
                className={cn(
                  'text-lg font-bold',
                  isProfit ? 'text-red-600' : 'text-blue-600'
                )}
              >
                {formatProfitRate(profitRate)}
              </p>
            </div>

            {/* Fun Feature: Equivalent Principal at 35 Interest */}
            {isProfit && totalProfit > 0 ? (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors border-b border-dashed border-muted-foreground/50 hover:border-foreground">
                        {t('interestPrincipal').replace('{rate}', interestRate.toString())}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60">
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <h4 className="font-medium leading-none">{t('interestPrincipal').replace('{rate}', interestRate.toString())}</h4>
                          <p className="text-sm text-muted-foreground">
                            {t('interestPrincipalTooltip')
                              .replace('{rate}', interestRate.toString())
                              .replace('{profit}', formatCurrency(Math.abs(displayProfit), currency))
                            }
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor="rate">Rate (%)</Label>
                            <Input
                              id="rate"
                              type="number"
                              value={interestRate}
                              onChange={(e) => setInterestRate(Number(e.target.value))}
                              className="col-span-2 h-8"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <TooltipProvider>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('interestPrincipalTooltip')
                          .replace('{rate}', interestRate.toString())
                          .replace('{profit}', formatCurrency(Math.abs(displayProfit), currency))
                        }</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-semibold text-muted-foreground/80">
                    {formatCurrency(displayProfit / (interestRate / 100), currency)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="hidden lg:block" />
            )}
          </div>
        </div>

        {/* 환율 표시 (KRW일 때) */}
        {currency === 'KRW' && exchangeRate && (
          <div className="mt-4 pt-4 border-t border-border text-sm text-right text-muted-foreground">
            {t('appliedExchangeRate')}: 1 USD = {formatCurrency(exchangeRate, 'KRW')}
          </div>
        )}

      </CardContent>
    </Card>
  )
}
