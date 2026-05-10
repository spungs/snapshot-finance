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
    /** localStorage 키 — 마지막 사용 계좌 기억. 미지정 시 영속화 안 함. */
    rememberKey?: string
    disabled?: boolean
    /** 단일 계좌일 때도 강제로 표시 (디버깅/테스트) */
    forceShow?: boolean
    label?: string
    className?: string
}

/**
 * 계좌 셀렉터 — 단일 계좌 사용자 UX 단순화:
 *   - 계좌 0~1개일 때는 자체적으로 렌더링 자체를 생략 (forceShow 제외)
 *   - localStorage 로 마지막 선택 기억 (rememberKey 지정 시)
 *
 * 호출 측은 항상 마운트하고, 단일 계좌라도 onChange 가 한 번 발화되어
 * accountId 가 부모 state 에 채워지도록 보장한다.
 */
export function AccountSelector({
    accounts,
    value,
    onChange,
    rememberKey,
    disabled,
    forceShow = false,
    label,
    className,
}: AccountSelectorProps) {
    const { language } = useLanguage()

    // 마운트 시점에 기본값 결정:
    //   1. 이미 value 가 들어와 있으면 그대로 둠
    //   2. localStorage 의 마지막 사용 계좌가 현재 목록에 있으면 그것
    //   3. 그 외 첫 번째 계좌
    useEffect(() => {
        if (accounts.length === 0) return
        if (value && accounts.some(a => a.id === value)) return

        let next: string | null = null
        if (rememberKey && typeof window !== 'undefined') {
            try {
                const stored = window.localStorage.getItem(rememberKey)
                if (stored && accounts.some(a => a.id === stored)) {
                    next = stored
                }
            } catch {
                // localStorage 접근 실패는 조용히 무시
            }
        }
        if (!next) next = accounts[0].id
        onChange(next)
        // accounts/value 만 의존 — onChange 는 매 렌더 새 함수일 가능성
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accounts, value, rememberKey])

    const handleChange = (id: string) => {
        onChange(id)
        if (rememberKey && typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(rememberKey, id)
            } catch {
                // ignore
            }
        }
    }

    // 단일 계좌 사용자 UX: 셀렉터 자체를 숨김
    if (!forceShow && accounts.length <= 1) {
        return null
    }

    const placeholder = language === 'ko' ? '계좌 선택' : 'Select account'

    return (
        <div className={className}>
            {label && (
                <div className="text-[10px] font-bold text-muted-foreground tracking-[1px] uppercase mb-1">
                    {label}
                </div>
            )}
            <Select value={value ?? undefined} onValueChange={handleChange} disabled={disabled}>
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
