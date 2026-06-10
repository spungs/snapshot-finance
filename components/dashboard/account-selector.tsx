'use client'

import { useEffect } from 'react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/lib/i18n/context'

export interface BrokerageAccountOption {
    id: string
    name: string
}

interface AccountSelectorProps {
    accounts: BrokerageAccountOption[]
    value: string | null
    onChange: (id: string) => void
    disabled?: boolean
    /** 단일 계좌일 때도 강제로 표시 (디버깅/테스트) */
    forceShow?: boolean
    label?: string
    className?: string
}

/**
 * 계좌 셀렉터 — 단일 계좌 사용자 UX 단순화:
 *   - 계좌 0~1개일 때는 자체적으로 렌더링 자체를 생략 (forceShow 제외)
 *
 * 호출 측은 항상 마운트하고, 단일 계좌라도 onChange 가 한 번 발화되어
 * accountId 가 부모 state 에 채워지도록 보장한다. 기본값(현재 보고 있는 계좌 등)
 * 결정은 호출 측 책임.
 */
export function AccountSelector({
    accounts,
    value,
    onChange,
    disabled,
    forceShow = false,
    label,
    className,
}: AccountSelectorProps) {
    const { language } = useLanguage()

    // value 가 비었거나 현재 목록에 없는 경우 첫 번째 계좌로 폴백 — 안전망.
    useEffect(() => {
        if (accounts.length === 0) return
        if (value && accounts.some(a => a.id === value)) return
        onChange(accounts[0].id)
        // accounts/value 만 의존 — onChange 는 매 렌더 새 함수일 가능성
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accounts, value])

    // 단일 계좌 사용자 UX: 셀렉터 자체를 숨김
    if (!forceShow && accounts.length <= 1) {
        return null
    }

    const placeholder = language === 'ko' ? '계좌 선택' : 'Select account'

    return (
        <div className={className}>
            {label && (
                <div className="text-[13px] font-medium text-muted-foreground mb-1">
                    {label}
                </div>
            )}
            <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
                <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                            {a.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
