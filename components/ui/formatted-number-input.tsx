import * as React from "react"
import { Input } from "@/components/ui/input"
import { formatNumber } from "@/lib/utils/formatters"

interface FormattedNumberInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
    value: string | number
    onChange: (value: string) => void
}

export const FormattedNumberInput = React.forwardRef<HTMLInputElement, FormattedNumberInputProps>(
    ({ value, onChange, onFocus, onBlur, placeholder, ...props }, ref) => {
        const [isFocused, setIsFocused] = React.useState(false)

        const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(true)
            onFocus?.(e)
        }

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(false)

            // 0010 -> 10 형식으로 숫자 포맷 정리
            const inputValue = e.target.value.replace(/,/g, '')
            if (inputValue !== '' && !isNaN(Number(inputValue))) {
                const sanitized = Number(inputValue).toString()
                // 값이 다를 경우에만 업데이트 (불필요한 렌더링 방지)
                // 단, 소수점 끝자리 0이 중요한 경우(10.50)가 있을 수 있으나 
                // formattedNumberInput 특성상 다시 포맷팅되므로 canonical 형태로 저장하는 것이 안전함
                if (inputValue !== sanitized) {
                    onChange(sanitized)
                }
            }

            onBlur?.(e)
        }

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value)
        }

        // When focused, show raw value. When blurred, show formatted value.
        // If value is empty, show empty string.
        const displayValue = isFocused
            ? value
            : value === "" || value === undefined
                ? ""
                : formatNumber(value)

        return (
            <Input
                {...props}
                ref={ref}
                type="text"
                value={displayValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={placeholder}
                inputMode="decimal"
            />
        )
    }
)
FormattedNumberInput.displayName = "FormattedNumberInput"
