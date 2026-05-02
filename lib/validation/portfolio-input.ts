// 포트폴리오 입력값 sanity check.
// AI가 반환한 값과 사용자가 직접 호출한 API 양쪽 모두 신뢰할 수 없으므로
// 라우트/액션 진입점에서 동일한 한도를 적용한다.

export const LIMITS = {
    quantity: { min: 0, max: 1_000_000 },         // 부분 매수 허용 → 0 < x ≤ 1,000,000
    averagePrice: { min: 0, max: 10_000_000_000 }, // 0 < x ≤ 100억 (KRW/USD 모두 커버)
    cashAmount: { min: 0, max: 10_000_000_000_000 }, // 0 ≤ x ≤ 10조 KRW
    stockName: { maxLength: 100 },
} as const

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

function toFiniteNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v)
        if (Number.isFinite(n)) return n
    }
    return null
}

export function validateQuantity(v: unknown): ValidationResult<number> {
    const n = toFiniteNumber(v)
    if (n === null) return { ok: false, error: '수량이 올바른 숫자가 아닙니다.' }
    if (n <= LIMITS.quantity.min) return { ok: false, error: '수량은 0보다 커야 합니다.' }
    if (n > LIMITS.quantity.max) return { ok: false, error: `수량은 ${LIMITS.quantity.max.toLocaleString()}주를 초과할 수 없습니다.` }
    return { ok: true, value: n }
}

export function validateAveragePrice(v: unknown): ValidationResult<number> {
    const n = toFiniteNumber(v)
    if (n === null) return { ok: false, error: '평단가가 올바른 숫자가 아닙니다.' }
    if (n <= LIMITS.averagePrice.min) return { ok: false, error: '평단가는 0보다 커야 합니다.' }
    if (n > LIMITS.averagePrice.max) return { ok: false, error: '평단가가 허용 범위를 초과했습니다.' }
    return { ok: true, value: n }
}

export function validateCashAmount(v: unknown): ValidationResult<number> {
    const n = toFiniteNumber(v)
    if (n === null) return { ok: false, error: '예수금이 올바른 숫자가 아닙니다.' }
    if (n < LIMITS.cashAmount.min) return { ok: false, error: '예수금은 0 이상이어야 합니다.' }
    if (n > LIMITS.cashAmount.max) return { ok: false, error: '예수금이 허용 범위를 초과했습니다.' }
    return { ok: true, value: n }
}

export function validateCurrency(v: unknown): ValidationResult<'KRW' | 'USD'> {
    if (v === 'KRW' || v === 'USD') return { ok: true, value: v }
    return { ok: false, error: '통화는 KRW 또는 USD만 허용됩니다.' }
}

export function validateStockName(v: unknown): ValidationResult<string> {
    if (typeof v !== 'string') return { ok: false, error: '종목명이 올바르지 않습니다.' }
    const trimmed = v.trim()
    if (trimmed.length === 0) return { ok: false, error: '종목명이 비어있습니다.' }
    if (trimmed.length > LIMITS.stockName.maxLength) return { ok: false, error: '종목명이 너무 깁니다.' }
    return { ok: true, value: trimmed }
}
