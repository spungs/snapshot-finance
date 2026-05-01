import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Thin space (U+2009) inserted after ₩ to prevent Pretendard ₩ horizontal strokes
// from visually merging with adjacent digits (strikethrough-like artifact).
export function formatCurrency(value: number, currency: string = 'KRW'): string {
  const formatted = new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'narrowSymbol',
  }).format(value)
  return formatted.replace(/^(-?)₩/, '$1₩ ')
}
