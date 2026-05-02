'use client'

import { useState, useEffect } from 'react'
import { getStockNews } from '@/actions/news'
import type { NewsStock } from '@/lib/news/m7'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

type SummaryMode = 'short' | 'medium' | 'long'

interface NewsArticleRow {
    id: string
    title: string
    url: string
    publishedAt: Date | string
    source: string | null
    summaryShort: string | null
    summaryMedium: string | null
    summaryLong: string | null
}

interface StockNewsPanelProps {
    symbols: NewsStock[]
}

export function StockNewsPanel({ symbols }: StockNewsPanelProps) {
    const { language } = useLanguage()
    const t = translations[language].news
    const [selectedSymbol, setSelectedSymbol] = useState(symbols[0]?.symbol ?? '')
    const [summaryMode, setSummaryMode] = useState<SummaryMode>('short')
    const [news, setNews] = useState<NewsArticleRow[]>([])
    const [loading, setLoading] = useState(false)
    const [fontSizeLevel, setFontSizeLevel] = useState(1)
    const fontSizes = ['text-sm', 'text-base', 'text-lg', 'text-xl']

    useEffect(() => {
        const saved = localStorage.getItem('sf-news-font-size')
        if (saved !== null) {
            const level = parseInt(saved, 10)
            if (level >= 0 && level <= 3) setFontSizeLevel(level)
        }
    }, [])

    useEffect(() => {
        localStorage.setItem('sf-news-font-size', fontSizeLevel.toString())
    }, [fontSizeLevel])

    useEffect(() => {
        if (!selectedSymbol) return
        const stock = symbols.find(s => s.symbol === selectedSymbol)
        const keywords = stock?.engName ? [stock.engName, stock.symbol] : undefined

        let cancelled = false
        setLoading(true)
        getStockNews(selectedSymbol, keywords)
            .then(data => {
                if (!cancelled) setNews(data)
            })
            .catch(err => console.error(err))
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => { cancelled = true }
    }, [selectedSymbol, symbols])

    if (symbols.length === 0) return null

    return (
        <div className="space-y-6">
            {/* 종목 버튼 행 */}
            <div className="overflow-x-auto pb-2 scrollbar-hide -mx-1">
                <div className="flex gap-2 px-1">
                    {symbols.map((stock) => {
                        const active = selectedSymbol === stock.symbol
                        const isLoadingThis = loading && active
                        return (
                            <Button
                                key={stock.symbol}
                                variant="ghost"
                                onClick={() => setSelectedSymbol(stock.symbol)}
                                disabled={isLoadingThis}
                                className={[
                                    'rounded-full px-5 h-9 shrink-0 border transition-colors',
                                    active
                                        ? 'bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background'
                                        : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:bg-accent/40',
                                ].join(' ')}
                            >
                                {isLoadingThis && <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                                <span className="font-serif text-sm">{stock.name}</span>
                                <span className="ml-2 text-[10px] tracking-[1px] uppercase opacity-60">{stock.symbol}</span>
                            </Button>
                        )
                    })}
                </div>
            </div>

            {/* 컨트롤 영역 */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card border border-border rounded-md p-4">
                <div className="flex items-center gap-3">
                    <span className="eyebrow">{t.summaryLevel}</span>
                    <RadioGroup
                        defaultValue="short"
                        value={summaryMode}
                        onValueChange={(v) => setSummaryMode(v as SummaryMode)}
                        className="flex items-center gap-3"
                    >
                        <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="short" id="short" />
                            <Label htmlFor="short" className="cursor-pointer text-sm">{t.short}</Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="medium" id="medium" />
                            <Label htmlFor="medium" className="cursor-pointer text-sm">{t.medium}</Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="long" id="long" />
                            <Label htmlFor="long" className="cursor-pointer text-sm">{t.long}</Label>
                        </div>
                    </RadioGroup>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <span className="eyebrow">{t.fontSize}</span>
                    <div className="flex items-center gap-1 border border-border rounded-full px-1 py-0.5">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full"
                            onClick={() => setFontSizeLevel(prev => Math.max(0, prev - 1))}
                            disabled={fontSizeLevel === 0}
                        >
                            <span className="text-sm font-bold">−</span>
                        </Button>
                        <span className="text-xs font-bold w-9 text-center tabular-nums">
                            {fontSizeLevel * 25 + 100}%
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full"
                            onClick={() => setFontSizeLevel(prev => Math.min(3, prev + 1))}
                            disabled={fontSizeLevel === 3}
                        >
                            <span className="text-sm font-bold">+</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* 뉴스 그리드 */}
            <div className="grid gap-5">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} className="animate-pulse">
                            <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
                            <CardContent><Skeleton className="h-24 w-full" /></CardContent>
                        </Card>
                    ))
                ) : news.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-md">
                        {t.noNews}
                    </div>
                ) : (
                    news.map((item) => (
                        <NewsCard
                            key={item.id}
                            item={item}
                            mode={summaryMode}
                            fontSizeClass={fontSizes[fontSizeLevel]}
                            locale={language}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

function NewsCard({ item, mode, fontSizeClass, locale }: { item: NewsArticleRow, mode: SummaryMode, fontSizeClass: string, locale: 'ko' | 'en' }) {
    const { language } = useLanguage()
    const t = translations[language].news

    const summaryText = mode === 'short'
        ? item.summaryShort
        : mode === 'medium'
            ? item.summaryMedium
            : item.summaryLong

    return (
        <Card className="overflow-hidden border-l-[3px] border-l-transparent hover:border-l-primary transition-colors">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-4">
                    <div className="space-y-2">
                        <CardTitle className="font-serif text-xl sm:text-2xl font-semibold leading-snug tracking-tight">
                            {item.title}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className="font-normal">{item.source}</Badge>
                            <span>·</span>
                            <span>
                                {formatDistanceToNow(new Date(item.publishedAt), {
                                    addSuffix: true,
                                    locale: locale === 'ko' ? ko : undefined,
                                })}
                            </span>
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="bg-accent-soft/60 p-4 mb-2 rounded-md">
                {summaryText ? (
                    <div className={`prose dark:prose-invert max-w-none leading-relaxed whitespace-pre-line ${fontSizeClass}`}>
                        {summaryText}
                    </div>
                ) : (
                    <p className="text-muted-foreground text-sm">{t.loadingSummary}</p>
                )}
            </CardContent>
            <CardFooter className="pb-4 pt-0 flex justify-end">
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-sm text-primary hover:underline hover:text-primary/80"
                >
                    {t.readOriginal} <ExternalLink className="ml-1 h-3 w-3" />
                </a>
            </CardFooter>
        </Card>
    )
}
