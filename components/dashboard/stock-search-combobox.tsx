'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { useLanguage } from '@/lib/i18n/context'

interface Stock {
    id: string
    stockCode: string
    stockName: string
    engName?: string
    market?: string
}

interface SearchResult {
    symbol: string
    name: string
    nameKo?: string
    nameEn?: string
    exchange: string
    market: string
    type: string
}

interface StockSearchComboboxProps {
    value: string
    onSelect: (stock: Stock) => void
    disabled?: boolean
}

export function StockSearchCombobox({
    value,
    onSelect,
    disabled,
}: StockSearchComboboxProps) {
    const { t, language } = useLanguage()
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState('')
    const [results, setResults] = React.useState<SearchResult[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [hasSearched, setHasSearched] = React.useState(false)
    const triggerRef = React.useRef<HTMLButtonElement>(null)
    const [triggerWidth, setTriggerWidth] = React.useState<number>()

    // 자동 debounce 검색은 제거 — 사용자가 Enter 또는 검색 버튼을 명시적으로 눌러야만 호출.
    // 검색 중에 새로운 검색이 들어오면 이전 요청은 취소하고 최신 요청만 반영한다.
    const abortRef = React.useRef<AbortController | null>(null)

    const searchStocks = React.useCallback(async (q: string) => {
        const trimmed = q.trim()

        // 진행 중인 이전 요청은 즉시 취소
        abortRef.current?.abort()

        if (!trimmed) {
            abortRef.current = null
            setResults([])
            setError(null)
            setLoading(false)
            return
        }

        const controller = new AbortController()
        abortRef.current = controller

        setLoading(true)
        setError(null)
        setResults([])
        try {
            const res = await fetch(`/api/stocks/search?query=${encodeURIComponent(trimmed)}`, {
                signal: controller.signal,
            })
            // 응답이 도착했더라도 이미 새 요청이 시작됐다면 결과 반영하지 않음
            if (controller.signal.aborted) return
            const data = await res.json()
            if (controller.signal.aborted) return
            if (data.success) {
                setResults(data.data)
                setError(null)
                setHasSearched(true)
            } else {
                setResults([])
                setError(data.error || t('searchError'))
            }
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') return
            console.error('Search failed:', error)
            setError(t('networkError'))
        } finally {
            if (abortRef.current === controller) {
                setLoading(false)
                abortRef.current = null
            }
        }
    }, [t])

    // 언마운트 시 진행 중 요청 정리
    React.useEffect(() => () => abortRef.current?.abort(), [])

    React.useEffect(() => {
        if (open && triggerRef.current) {
            setTriggerWidth(triggerRef.current.offsetWidth)
        }
    }, [open])

    const handleManualSearch = () => {
        searchStocks(query)
    }

    const handleSelect = async (result: SearchResult) => {
        try {
            const res = await fetch('/api/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stockCode: result.symbol,
                    stockName: result.nameKo || result.name,
                    engName: result.nameEn,
                    market: result.market,
                    sector: result.type,
                }),
            })
            const data = await res.json()

            if (data.success) {
                onSelect(data.data)
                setOpen(false)
                setQuery('')
                setHasSearched(false)
                setResults([])
            }
        } catch (error) {
            console.error('Failed to select stock:', error)
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    ref={triggerRef}
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                    disabled={disabled}
                >
                    <span className="truncate flex-1 text-left">
                        {value || t('selectStock')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="p-0 flex flex-col"
                align="start"
                side="top"
                sideOffset={6}
                collisionPadding={12}
                style={{
                    ...(triggerWidth ? { width: triggerWidth } : {}),
                    maxHeight: 'var(--radix-popover-content-available-height)',
                }}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <Command shouldFilter={false} className="flex-1 min-h-0 flex flex-col">
                    <CommandList className="flex-1 min-h-0 overflow-y-auto order-1">
                        {loading && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                                {t('searchSearching')}
                            </div>
                        )}
                        {error && (
                            <div className="py-6 text-center text-sm text-destructive px-4 whitespace-pre-wrap">
                                {error}
                            </div>
                        )}
                        {!loading && !error && results.length === 0 && hasSearched && (
                            <CommandEmpty>{t('searchEmpty')}</CommandEmpty>
                        )}
                        <CommandGroup>
                            {results.map((result, index) => {
                                const primaryName = language === 'ko'
                                    ? (result.nameKo || result.name)
                                    : (result.nameEn || result.name)
                                const secondaryName = language === 'ko'
                                    ? result.nameEn
                                    : result.nameKo

                                return (
                                    <CommandItem
                                        key={`${result.symbol}-${result.exchange}-${index}`}
                                        value={`${result.symbol}-${result.exchange}`}
                                        onSelect={() => handleSelect(result)}
                                        className="py-3"
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                value === result.symbol ? 'opacity-100' : 'opacity-0',
                                            )}
                                        />
                                        <div className="flex flex-col truncate w-full">
                                            <span className="truncate text-base font-medium" title={primaryName}>
                                                {primaryName}
                                            </span>
                                            <span className="text-xs text-muted-foreground truncate">
                                                {result.symbol} | {result.market}
                                                {secondaryName && secondaryName !== primaryName && ` | ${secondaryName}`}
                                            </span>
                                        </div>
                                    </CommandItem>
                                )
                            })}
                        </CommandGroup>
                    </CommandList>
                    <div className="flex items-center border-t px-3 order-2 shrink-0" cmdk-input-wrapper="">
                        <input
                            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder={t('searchPlaceholder')}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.nativeEvent.isComposing) return
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleManualSearch()
                                }
                            }}
                            autoFocus
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 ml-1"
                            onClick={handleManualSearch}
                        >
                            <Search className="h-4 w-4" />
                        </Button>
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
