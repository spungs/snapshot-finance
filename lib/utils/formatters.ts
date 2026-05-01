import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// Thin space (U+2009) — ₩ 뒤 시각 분리에 사용 (regular space 보다 좁음)
const THIN_SPACE = ' '

/**
 * 금액 포맷팅 (예: ₩ 12,345,678)
 *
 * Pretendard ₩ 글리프의 가로선이 인접 숫자에 시각적으로 이어져 strikethrough처럼
 * 보이는 문제를 막기 위해 ₩ 뒤에 thin space(U+2009)를 삽입한다.
 *
 * `compact: true`면 좁은 영역(KPI 카드 등)을 위해 임계값 이상부터 단위 축약:
 *   KRW: 1억 미만은 풀 표시, 이상은 "1.23억"/"12.3억"/"1,234억"/"1.23조"
 *   USD: $1M 미만은 풀, 이상은 "$1.23M"/"$1.23B"
 */
export function formatCurrency(
  value: number | string,
  currency: string = 'KRW',
  options: { compact?: boolean } = {},
): string {
  const num = Number(value)

  if (options.compact) {
    const c = formatCompact(num, currency)
    if (c !== null) return c
  }

  const formatted = new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'narrowSymbol',
  }).format(num)
  return formatted.replace(/^(-?)₩/, `$1₩${THIN_SPACE}`)
}

function formatCompact(num: number, currency: string): string | null {
  if (!Number.isFinite(num)) return null
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''

  if (currency === 'KRW') {
    if (abs < 100_000_000) return null
    if (abs < 1_000_000_000_000) {
      const eok = abs / 100_000_000
      const display = eok < 10
        ? eok.toFixed(2)
        : eok < 100
          ? eok.toFixed(1)
          : Math.round(eok).toLocaleString('ko-KR')
      return `${sign}₩${THIN_SPACE}${display}억`
    }
    const jo = abs / 1_000_000_000_000
    return `${sign}₩${THIN_SPACE}${jo.toFixed(2)}조`
  }

  if (currency === 'USD') {
    if (abs < 1_000_000) return null
    if (abs < 1_000_000_000) {
      return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
    }
    return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  }

  return null
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
 * 수익률 포맷팅 (예: +12.34%, -5.67%)
 */
export function formatProfitRate(value: number | string, showPlus = false): string {
  const rate = Number(value)
  const prefix = rate > 0 && showPlus ? '+' : ''
  return `${prefix}${rate.toFixed(2)}%`
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
