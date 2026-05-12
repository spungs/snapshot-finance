'use client'

import { useMemo } from 'react'
import Decimal from 'decimal.js'
import { Plus, Trash2 } from 'lucide-react'
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/lib/i18n/context'
import { formatCurrency } from '@/lib/utils/formatters'
import type { CashAccount } from '@/types/cash'
import type { Currency } from '@/lib/currency/context'

// 에디터 내부에서 다루는 행. amount 는 display currency(currency prop) 기준의 문자열.
// 서버 저장 시 KRW 로 환산되어 CashAccount.amount(KRW Decimal string)가 된다.
export interface CashAccountRow {
    id: string
    label: string
    amount: string
}

// 다이얼로그/스냅샷 폼에서 공통으로 쓰는 행 편집 UI.
// 라벨 + 금액 input 1쌍을 N개 관리하고, 합계를 실시간 표시한다.
// 입력 금액은 currency prop 의 단위로 가정한다 (KRW/USD 둘 다 지원).
interface Props {
    accounts: CashAccountRow[]
    onChange: (next: CashAccountRow[]) => void
    currency?: Currency
    disabled?: boolean
    maxAccounts?: number
}

const DEFAULT_MAX = 20

let __seq = 0
function newLocalId() {
    __seq += 1
    return `tmp-${Date.now()}-${__seq}`
}

export function CashAccountEditor({
    accounts,
    onChange,
    currency = 'KRW',
    disabled,
    maxAccounts = DEFAULT_MAX,
}: Props) {
    const { language } = useLanguage()
    const pricePrefix = currency === 'KRW' ? '₩' : '$'

    const total = useMemo(() => {
        return accounts.reduce((sum, a) => {
            const trimmed = (a.amount || '').replace(/,/g, '').trim()
            if (!trimmed) return sum
            try {
                return sum.plus(new Decimal(trimmed))
            } catch {
                return sum
            }
        }, new Decimal(0))
    }, [accounts])

    const handleAdd = () => {
        if (accounts.length >= maxAccounts) return
        onChange([...accounts, { id: newLocalId(), label: '', amount: '' }])
    }

    const handleRemove = (id: string) => {
        onChange(accounts.filter(a => a.id !== id))
    }

    const handleField = (id: string, field: 'label' | 'amount', value: string) => {
        onChange(accounts.map(a => (a.id === id ? { ...a, [field]: value } : a)))
    }

    const reachedMax = accounts.length >= maxAccounts

    return (
        <div className="space-y-3">
            {accounts.length === 0 ? (
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={disabled}
                    className="w-full text-center py-6 border border-dashed border-border hover:border-primary hover:bg-accent-soft transition-colors disabled:opacity-50 rounded-sm"
                >
                    <Plus className="w-4 h-4 mx-auto mb-1 text-primary" />
                    <p className="text-xs text-muted-foreground">
                        {language === 'ko' ? '계좌별로 예수금을 추가하세요' : 'Add a cash account'}
                    </p>
                </button>
            ) : (
                <div className="space-y-2">
                    {accounts.map((a, idx) => (
                        <div key={a.id} className="flex items-start gap-2">
                            <div className="flex-[3] min-w-0">
                                <Input
                                    type="text"
                                    value={a.label}
                                    onChange={e => handleField(a.id, 'label', e.target.value)}
                                    placeholder={
                                        language === 'ko' ? `계좌 ${idx + 1} 이름` : `Account ${idx + 1}`
                                    }
                                    disabled={disabled}
                                    maxLength={50}
                                />
                            </div>
                            <div className="flex-[4] min-w-0">
                                <FormattedNumberInput
                                    value={a.amount}
                                    onChange={v => handleField(a.id, 'amount', v)}
                                    prefix={pricePrefix}
                                    disabled={disabled}
                                    placeholder="0"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => handleRemove(a.id)}
                                disabled={disabled}
                                aria-label={language === 'ko' ? '계좌 삭제' : 'Remove account'}
                                className="p-2 mt-0.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 shrink-0"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {accounts.length > 0 && (
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={disabled || reachedMax}
                    className="inline-flex items-center gap-1 text-xs font-bold tracking-wide text-primary px-2 py-1.5 hover:bg-accent-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-3.5 h-3.5" />
                    {language === 'ko' ? '계좌 추가' : 'Add account'}
                    {reachedMax && (
                        <span className="text-muted-foreground font-normal ml-1">
                            ({language === 'ko' ? `최대 ${maxAccounts}개` : `max ${maxAccounts}`})
                        </span>
                    )}
                </button>
            )}

            {accounts.length > 0 && (
                <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="text-[10px] font-bold tracking-[1px] uppercase text-muted-foreground">
                        {language === 'ko' ? '합계' : 'Total'}
                    </span>
                    <span className="font-serif text-base font-semibold text-foreground numeric">
                        {formatCurrency(total.toNumber(), currency)}
                    </span>
                </div>
            )}
        </div>
    )
}

// 저장된 CashAccount[] (KRW Decimal string) → 에디터 표시 통화 단위 행.
export function toEditorRows(
    stored: CashAccount[] | null | undefined,
    currency: Currency,
    exchangeRate: number,
): CashAccountRow[] {
    if (!stored || stored.length === 0) return []
    return stored.map(a => {
        let krw: Decimal
        try {
            krw = new Decimal(a.amount || '0')
        } catch {
            krw = new Decimal(0)
        }
        const display = currency === 'USD' && exchangeRate > 0 ? krw.div(exchangeRate) : krw
        return {
            id: a.id,
            label: a.label,
            amount: display.toFixed(currency === 'USD' ? 2 : 0),
        }
    })
}

// 에디터 행 → 서버 전송 페이로드 (KRW Decimal string).
// label 의 trim 및 빈 라벨 처리는 서버 측 validateCashAccounts 가 담당.
export function fromEditorRows(
    rows: CashAccountRow[],
    currency: Currency,
    exchangeRate: number,
): Array<{ id: string; label: string; amount: string }> {
    return rows.map(r => {
        const cleaned = (r.amount || '').replace(/,/g, '').trim()
        let n: Decimal
        try {
            n = cleaned ? new Decimal(cleaned) : new Decimal(0)
        } catch {
            n = new Decimal(0)
        }
        const krw = currency === 'USD' && exchangeRate > 0 ? n.times(exchangeRate) : n
        return {
            id: r.id.startsWith('tmp-') ? '' : r.id,
            label: r.label,
            amount: krw.toFixed(2),
        }
    })
}
