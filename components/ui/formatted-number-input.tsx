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
