// 포트폴리오 입력값 sanity check.
// AI가 반환한 값과 사용자가 직접 호출한 API 양쪽 모두 신뢰할 수 없으므로
// 라우트/액션 진입점에서 동일한 한도를 적용한다.

import Decimal from 'decimal.js'
import { randomUUID } from 'crypto'
import type { CashAccount } from '@/types/cash'

export const LIMITS = {
    quantity: { min: 0, max: 1_000_000 },         // 부분 매수 허용 → 0 < x ≤ 1,000,000
    averagePrice: { min: 0, max: 10_000_000_000 }, // 0 < x ≤ 100억 (KRW/USD 모두 커버)
    cashAmount: { min: 0, max: 10_000_000_000_000 }, // 0 ≤ x ≤ 10조 KRW
    stockName: { maxLength: 100 },
    cashAccount: { maxCount: 20, labelMaxLength: 50 },
} as const

export const DEFAULT_CASH_LABEL = '예수금'

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

// 계좌별 예수금 입력 검증 + 정규화.
// - 라벨 trim 후 빈 문자열은 DEFAULT_CASH_LABEL 로 치환
// - 각 amount 는 cashAmount 한도 통과해야 함
// - 합계도 cashAmount 한도 통과해야 함 (10조 KRW 상한)
// - id 가 누락/빈 문자열이면 새 UUID 부여
export function validateCashAccounts(v: unknown): ValidationResult<CashAccount[]> {
    if (v === null || v === undefined) return { ok: true, value: [] }
    if (!Array.isArray(v)) return { ok: false, error: '예수금 계좌 목록이 배열이 아닙니다.' }
    if (v.length > LIMITS.cashAccount.maxCount) {
        return { ok: false, error: `예수금 계좌는 최대 ${LIMITS.cashAccount.maxCount}개까지 허용됩니다.` }
    }

    const result: CashAccount[] = []
    let total = new Decimal(0)
    for (const item of v) {
        if (!item || typeof item !== 'object') {
            return { ok: false, error: '예수금 계좌 항목이 올바르지 않습니다.' }
        }
        const raw = item as { id?: unknown; label?: unknown; amount?: unknown }

        let label = typeof raw.label === 'string' ? raw.label.trim() : ''
        if (label.length === 0) label = DEFAULT_CASH_LABEL
        if (label.length > LIMITS.cashAccount.labelMaxLength) {
            return { ok: false, error: `계좌 이름이 너무 깁니다 (최대 ${LIMITS.cashAccount.labelMaxLength}자).` }
        }

        const amountCheck = validateCashAmount(raw.amount)
        if (!amountCheck.ok) return { ok: false, error: amountCheck.error }

        const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : randomUUID()
        result.push({ id, label, amount: String(amountCheck.value) })
        total = total.plus(amountCheck.value)
    }

    const totalCheck = validateCashAmount(total.toNumber())
    if (!totalCheck.ok) return { ok: false, error: '예수금 합계가 허용 범위를 초과했습니다.' }
    return { ok: true, value: result }
}

// 계좌별 금액의 합계를 Decimal 로 반환. 호출 전 validateCashAccounts 통과를 가정.
export function sumCashAccounts(accounts: CashAccount[]): Decimal {
    return accounts.reduce((sum, a) => sum.plus(a.amount), new Decimal(0))
}
