import * as React from "react"
import { Input } from "@/components/ui/input"
import { formatNumber } from "@/lib/utils/formatters"
import { cn } from "@/lib/utils"

interface FormattedNumberInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
    value: string | number
    onChange: (value: string) => void
    label?: string
    prefix?: string
    suffix?: string
}

export const FormattedNumberInput = React.forwardRef<HTMLInputElement, FormattedNumberInputProps>(
    ({ value, onChange, onFocus, onBlur, placeholder, label, prefix, suffix, className, ...props }, ref) => {
        const [isFocused, setIsFocused] = React.useState(false)

        const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(true)
            onFocus?.(e)
        }

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(false)

            const inputValue = e.target.value.replace(/,/g, '')
            if (inputValue !== '' && !isNaN(Number(inputValue))) {
                const sanitized = Number(inputValue).toString()
                if (inputValue !== sanitized) {
                    onChange(sanitized)
                }
            }

            onBlur?.(e)
        }

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value)
        }

        const isEmpty = value === "" || value === undefined || value === null
        const displayValue = isFocused
            ? value
            : isEmpty
                ? ""
                : formatNumber(value)

        const isFloated = isFocused || !isEmpty

        if (!label && !prefix && !suffix) {
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
                    className={className}
                    inputMode="decimal"
                />
            )
        }

        return (
            <div className={cn("relative", className)}>
                {label && (
                    <span
                        className={cn(
                            "pointer-events-none absolute left-3 transition-all duration-150 z-[1]",
                            isFloated
                                ? "top-1 text-[9px] font-bold tracking-[0.5px] uppercase text-muted-foreground"
                                : "top-1/2 -translate-y-1/2 text-sm text-muted-foreground",
                        )}
                    >
                        {label}
                    </span>
                )}
                {prefix && isFloated && (
                    <span className={cn(
                        "pointer-events-none absolute inset-y-0 left-3 flex items-center text-base md:text-sm text-muted-foreground numeric",
                        // 라벨이 있을 때만 패딩으로 input baseline 에 맞춤. 라벨 없으면 flex 만으로 수직 중앙 정렬.
                        label && "pt-5 pb-1.5",
                    )}>
                        {prefix}
                    </span>
                )}
                {suffix && isFloated && (
                    <span className={cn(
                        "pointer-events-none absolute inset-y-0 right-3 flex items-center text-base md:text-sm text-muted-foreground",
                        label && "pt-5 pb-1.5",
                    )}>
                        {suffix}
                    </span>
                )}
                <Input
                    {...props}
                    ref={ref}
                    type="text"
                    value={displayValue}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder={isFloated ? '' : placeholder}
                    inputMode="decimal"
                    className={cn(
                        label && "pt-5 pb-1.5 h-auto min-h-[52px]",
                        prefix && isFloated && "pl-7",
                        suffix && isFloated && "pr-8",
                        "numeric",
                    )}
                />
            </div>
        )
    }
)
FormattedNumberInput.displayName = "FormattedNumberInput"
