import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

/**
 * 금액 포맷팅 (예: ₩12,345,678)
 */
export function formatCurrency(value: number | string, currency: string = 'KRW'): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'narrowSymbol',
  }).format(Number(value))
}

/**
 * 숫자 포맷팅 (예: 12,345,678)
 */
export function formatNumber(value: number | string, decimals?: number): string {
  if (!value && value !== 0) return ''
  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: decimals !== undefined ? decimals : 6,
    minimumFractionDigits: decimals !== undefined ? decimals : 0,
  }).format(Number(value))
}

/**
 * 수익률 포맷팅 (예: +12.34%)
 */
export function formatProfitRate(value: number | string): string {
  const rate = Number(value)
  return `${Math.abs(rate).toFixed(2)}%`
}

/**
 * 날짜 포맷팅
 */
export function formatDate(date: Date | string, formatStr = 'yyyy-MM-dd HH:mm'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, formatStr, { locale: ko })
}

/**
 * 상대적 날짜 표시 (예: 오늘, 어제, 3일 전)
 */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))

  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff < 7) return `${diff}일 전`
  if (diff < 30) return `${Math.floor(diff / 7)}주 전`
  return formatDate(d, 'yyyy-MM-dd')
}
