'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { useDebounce } from '@/lib/hooks/use-debounce'
import { useMediaQuery } from "@/lib/hooks/use-media-query"
import { useLanguage } from '@/lib/i18n/context'

interface Stock {
    id: string
    stockCode: string
    stockName: string
    market?: string
}

interface SearchResult {
    symbol: string
    name: string
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
    const { t } = useLanguage()
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState('')
    const [results, setResults] = React.useState<SearchResult[]>([])
    const [loading, setLoading] = React.useState(false)
    const [selectingLoading, setSelectingLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [hasSearched, setHasSearched] = React.useState(false)
    const isDesktop = useMediaQuery("(min-width: 768px)")

    // Timer ref for debounce
    const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null)

    const searchStocks = React.useCallback(async () => {
        if (!query) {
            setResults([])
            setError(null)
            return
        }

        setLoading(true)
        setError(null)
        setResults([]) // Clear previous results when starting new search
        try {
            const res = await fetch(`/api/stocks/search?query=${encodeURIComponent(query)}`)
            const data = await res.json()
            if (data.success) {
                setResults(data.data)
                setError(null)
                setHasSearched(true)
            } else {
                setResults([])
                setError(data.error || t('searchError'))
            }
        } catch (error) {
            console.error('Search failed:', error)
            setError(t('networkError'))
        } finally {
            setLoading(false)
        }
    }, [query, t])

    // Debounce effect
    React.useEffect(() => {
        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }

        // Set new timer
        debounceTimerRef.current = setTimeout(() => {
            searchStocks()
        }, 1200)

        // Cleanup
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
        }
    }, [searchStocks])

    const handleManualSearch = () => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
        }
        searchStocks()
    }

    const handleSelect = async (result: SearchResult) => {
        setSelectingLoading(true)
        try {
            // Create or get stock from DB
            const res = await fetch('/api/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stockCode: result.symbol,
                    stockName: result.name,
                    market: result.market,
                    sector: result.type, // Fallback for sector
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
        } finally {
            setSelectingLoading(false)
        }
    }

    if (isDesktop) {
        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
                        disabled={disabled}
                    >
                        <span className="truncate flex-1 text-left">
                            {value
                                ? value
                                : t('selectStock')}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                    <Command shouldFilter={false} className="h-full">
                        <StockSearchContent
                            query={query}
                            setQuery={setQuery}
                            handleManualSearch={handleManualSearch}
                            loading={loading}
                            error={error}
                            results={results}
                            hasSearched={hasSearched}
                            value={value}
                            handleSelect={handleSelect}
                            t={t}
                        />
                    </Command>
                </PopoverContent>
            </Popover>
        )
    }

    return (
        <>
            <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
                disabled={disabled}
                onClick={() => setOpen(true)}
            >
                <span className="truncate flex-1 text-left">
                    {value
                        ? value
                        : t('selectStock')}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent showCloseButton={false} className="p-0 overflow-hidden gap-0 top-[10%] translate-y-0 sm:translate-y-[-50%] sm:top-[50%]">
                    <DialogTitle className="sr-only">{t('selectStock')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('searchPlaceholder')}</DialogDescription>
                    <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
                        <StockSearchContent
                            query={query}
                            setQuery={setQuery}
                            handleManualSearch={handleManualSearch}
                            loading={loading}
                            error={error}
                            results={results}
                            hasSearched={hasSearched}
                            value={value}
                            handleSelect={handleSelect}
                            t={t}
                        />
                    </Command>
                </DialogContent>
            </Dialog>
        </>
    )
}

function StockSearchContent({
    query,
    setQuery,
    handleManualSearch,
    loading,
    error,
    results,
    hasSearched,
    value,
    handleSelect,
    t
}: {
    query: string
    setQuery: (val: string) => void
    handleManualSearch: () => void
    loading: boolean
    error: string | null
    results: SearchResult[]
    hasSearched: boolean
    value: string
    handleSelect: (result: SearchResult) => void
    t: (key: any) => string
}) {
    return (
        <>
            <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
                <input
                    className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={t('searchPlaceholder')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault() // Prevent form submission if any
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
            <CommandList className="max-h-[300px] overflow-y-auto">
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
                    {results.map((result, index) => (
                        <CommandItem
                            key={`${result.symbol}-${result.exchange}-${index}`}
                            value={`${result.symbol}-${result.exchange}`}
                            onSelect={() => handleSelect(result)}
                            className="py-3"
                        >
                            <Check
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    value === result.symbol ? "opacity-100" : "opacity-0"
                                )}
                            />
                            <div className="flex flex-col truncate w-full">
                                <span className="truncate text-base font-medium" title={result.name}>{result.name}</span>
                                <span className="text-xs text-muted-foreground truncate">
                                    {result.symbol} | {result.market}
                                </span>
                            </div>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </>
    )
}
