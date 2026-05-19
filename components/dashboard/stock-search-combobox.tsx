'use client'

import * as React from 'react'
import { Drawer } from 'vaul'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { useLanguage } from '@/lib/i18n/context'

interface Stock {
    stockCode: string
    stockName?: string         // nameKo alias for legacy client compatibility
    nameKo: string
    nameEn?: string | null
    market: string
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
    /**
     * 부모가 이미 Radix `Dialog` / Vaul `Drawer` 등 modal 컨테이너인 경우 `true` 로 둔다.
     * - Popover/Drawer 트리거 없이 검색 input + 결과 리스트를 그 자리에 인라인 렌더한다.
     * - 외부 Radix Dialog 의 `react-remove-scroll` 가 Popover/Drawer Portal 자식의
     *   wheel/touch 이벤트를 가로채 결과 리스트가 스크롤되지 않는 알려진 충돌을 회피.
     *   (Radix #1159 / #2028 / #3423, shadcn #6988, Vaul #366, tigerabrodi.blog 2026-03)
     */
    inline?: boolean
}

export function StockSearchCombobox({
    value,
    onSelect,
    disabled,
    inline = false,
}: StockSearchComboboxProps) {
    const { t, language } = useLanguage()
    // PC 는 Popover, 모바일은 Drawer — Radix Popover + cmdk + iOS 가상키보드 조합에서
    // available-height 계산 오류로 결과 리스트 스크롤이 막히는 문제를 회피한다.
    const isDesktop = useMediaQuery('(min-width: 768px)')
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

    React.useEffect(() => () => abortRef.current?.abort(), [])

    React.useEffect(() => {
        if (open && triggerRef.current) {
            setTriggerWidth(triggerRef.current.offsetWidth)
        }
    }, [open])

    // 닫힐 때 검색 상태 초기화
    React.useEffect(() => {
        if (!open) {
            setQuery('')
            setResults([])
            setHasSearched(false)
            setError(null)
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
                body: JSON.stringify({ stockCode: result.symbol }),
            })
            const data = await res.json()

            if (data.success) {
                onSelect({ ...data.data, stockName: data.data.nameKo })
                if (inline) {
                    // 인라인 모드는 open state 가 없으므로 검색 상태를 직접 초기화.
                    setQuery('')
                    setResults([])
                    setHasSearched(false)
                    setError(null)
                } else {
                    setOpen(false)
                }
            }
        } catch (error) {
            console.error('Failed to select stock:', error)
        }
    }

    const trigger = (
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
    )

    const searchBar = (
        <div className="flex items-center gap-1 px-3 shrink-0">
            <Search className="h-4 w-4 opacity-50 shrink-0" />
            <input
                className="flex h-11 w-full bg-transparent py-3 text-base md:text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleManualSearch}
            >
                <Search className="h-4 w-4" />
            </Button>
        </div>
    )

    const resultList = (
        <>
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
                <div className="py-6 text-center text-sm text-muted-foreground">
                    {t('searchEmpty')}
                </div>
            )}
            <ul className="w-full min-w-0 p-1">
                {results.map((result, index) => {
                    const primaryName = language === 'ko'
                        ? (result.nameKo || result.name)
                        : (result.nameEn || result.name)
                    const secondaryName = language === 'ko'
                        ? result.nameEn
                        : result.nameKo

                    return (
                        <li key={`${result.symbol}-${result.exchange}-${index}`}>
                            <button
                                type="button"
                                onClick={() => handleSelect(result)}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-3 text-left hover:bg-accent hover:text-accent-foreground active:bg-accent"
                            >
                                <Check
                                    className={cn(
                                        'h-4 w-4 shrink-0',
                                        value === result.symbol ? 'opacity-100' : 'opacity-0',
                                    )}
                                />
                                <div className="flex flex-col truncate min-w-0 flex-1">
                                    <span className="truncate text-base font-medium" title={primaryName}>
                                        {primaryName}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate">
                                        {result.symbol} | {result.market}
                                        {secondaryName && secondaryName !== primaryName && ` | ${secondaryName}`}
                                    </span>
                                </div>
                            </button>
                        </li>
                    )
                })}
            </ul>
        </>
    )

    // ★ 인라인 모드 — 부모가 이미 Dialog/Drawer 인 경우.
    //   Popover/Drawer Portal 없이 검색 input + 결과 리스트를 그 자리에 렌더한다.
    //   외부 Radix Dialog 의 RemoveScroll 이 자기 자식인 결과 리스트의 wheel/touch 를
    //   허용 영역으로 인식해 스크롤이 정상 동작한다.
    //
    //   ⚠ min-w-0 / w-full 은 필수: DialogContent 가 `grid` 라서 grid item 의 기본
    //   min-width 가 auto. 결과 button 의 긴 영문명이 부모 폭을 강제로 늘려
    //   Dialog 가 viewport 밖으로 빠져나가는 사고를 막는다.
    if (inline) {
        return (
            <div className="flex w-full min-w-0 flex-col gap-2">
                {value && (
                    <div className="text-xs text-muted-foreground truncate">
                        {language === 'ko' ? '선택됨' : 'Selected'}:{' '}
                        <span className="font-medium text-foreground">{value}</span>
                    </div>
                )}
                {/* 검색 input — 폼의 다른 input 과 동일 룩 (별도 카드 아님) */}
                <div className="flex w-full min-w-0 items-center gap-1 rounded-md border border-input bg-background px-3">
                    <Search className="h-4 w-4 opacity-50 shrink-0" />
                    <input
                        className="flex h-10 w-full min-w-0 bg-transparent py-2 text-base md:text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={handleManualSearch}
                    >
                        <Search className="h-4 w-4" />
                    </Button>
                </div>
                {/* 결과 — 검색이 한 번이라도 일어났거나 진행 중일 때만 노출.
                    별도 카드 룩 대신 폼 내부의 한 영역으로 자연스럽게 통합:
                    bg-muted/30 으로 살짝 구분, border 는 제거. */}
                {(loading || error || hasSearched) && (
                    <div
                        className="w-full min-w-0 overflow-y-auto overscroll-contain rounded-md bg-muted/30"
                        style={{
                            maxHeight: 'min(40vh, 320px)',
                            WebkitOverflowScrolling: 'touch',
                        }}
                        role="listbox"
                    >
                        {resultList}
                    </div>
                )}
            </div>
        )
    }

    if (!isDesktop) {
        return (
            <Drawer.Root open={open} onOpenChange={setOpen}>
                <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
                    <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[88vh] flex-col rounded-t-xl border bg-popover text-popover-foreground outline-none">
                        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted shrink-0" />
                        <Drawer.Title className="sr-only">{t('selectStock')}</Drawer.Title>
                        <div className="border-b py-2 mt-2 shrink-0">{searchBar}</div>
                        <div
                            className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
                            style={{ WebkitOverflowScrolling: 'touch' }}
                        >
                            {resultList}
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        )
    }

    // PC: 결과 영역에 명시적 max-height 를 직접 박는다. PopoverContent 의
    // maxHeight 만으로는 자식 flex-1 이 늘어날 부모 height 가 없어
    // 스크롤 영역이 생기지 않는 패턴을 피한다.
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
                className="p-0 flex flex-col overflow-hidden"
                align="start"
                side="top"
                sideOffset={6}
                collisionPadding={12}
                style={triggerWidth ? { width: triggerWidth } : undefined}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <div className="overflow-y-auto order-1 max-h-[360px]">
                    {resultList}
                </div>
                <div className="border-t py-2 order-2 shrink-0">{searchBar}</div>
            </PopoverContent>
        </Popover>
    )
}
