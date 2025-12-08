import Decimal from 'decimal.js'

/**
 * 수익률 계산
 * @param currentValue 현재 평가액
 * @param totalCost 총 매입금액
 * @returns 수익률 (%)
 */
export function calculateProfitRate(
  currentValue: number | string | Decimal,
  totalCost: number | string | Decimal
): Decimal {
  const current = new Decimal(currentValue)
  const cost = new Decimal(totalCost)

  if (cost.isZero()) return new Decimal(0)

  return current.minus(cost).div(cost).times(100)
}

/**
 * 평가손익 계산
 */
export function calculateProfit(
  currentValue: number | string | Decimal,
  totalCost: number | string | Decimal
): Decimal {
  return new Decimal(currentValue).minus(totalCost)
}

/**
 * 평가금액 계산 (수량 * 현재가)
 */
export function calculateCurrentValue(
  quantity: number,
  currentPrice: number | string | Decimal
): Decimal {
  return new Decimal(quantity).times(currentPrice)
}

/**
 * 매입금액 계산 (수량 * 평균매입가)
 */
export function calculateTotalCost(
  quantity: number,
  averagePrice: number | string | Decimal
): Decimal {
  return new Decimal(quantity).times(averagePrice)
}
