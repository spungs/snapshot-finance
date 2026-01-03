'use client'

import { useState, useEffect } from 'react'
import { getBigTechNews } from '@/actions/news'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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

const BIG_7 = [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'NVDA', name: 'Nvidia' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'META', name: 'Meta' },
]

type SummaryMode = 'short' | 'medium' | 'long'

export function BigTechNewsClient() {
    const { language } = useLanguage()
    const t = translations[language].news
    const [selectedSymbol, setSelectedSymbol] = useState('AAPL')
    const [summaryMode, setSummaryMode] = useState<SummaryMode>('short')
    const [news, setNews] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    // Font size state: 0=sm, 1=base(default), 2=lg, 3=xl
    const [fontSizeLevel, setFontSizeLevel] = useState(1)
    const fontSizes = ['text-sm', 'text-base', 'text-lg', 'text-xl']

    // Load font size from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('sf-news-font-size')
        if (saved !== null) {
            const level = parseInt(saved, 10)
            if (level >= 0 && level <= 3) {
                setFontSizeLevel(level)
            }
        }
    }, [])

    // Save font size to localStorage
    useEffect(() => {
        localStorage.setItem('sf-news-font-size', fontSizeLevel.toString())
    }, [fontSizeLevel])

    const fetchNews = async (symbol: string) => {
        setLoading(true)
        try {
            const data = await getBigTechNews(symbol)
            setNews(data)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchNews(selectedSymbol)
    }, [selectedSymbol])

    return (
        <div className="space-y-6">
            {/* Top Controls: Ticker Tabs & Font Size */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="w-full lg:w-auto overflow-x-auto pb-2 scrollbar-hide">
                    <div className="flex space-x-2">
                        {BIG_7.map((stock) => (
                            <Button
                                key={stock.symbol}
                                variant={selectedSymbol === stock.symbol ? "default" : "outline"}
                                onClick={() => setSelectedSymbol(stock.symbol)}
                                disabled={loading && selectedSymbol === stock.symbol}
                                className="rounded-full px-6 flex items-center gap-2"
                            >
                                {loading && selectedSymbol === stock.symbol && (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                )}
                                {stock.name}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Font Size Control */}
                <div className="flex items-center gap-2 bg-secondary/50 p-1.5 px-3 rounded-full shrink-0 self-end lg:self-auto">
                    <span className="text-xs font-semibold text-muted-foreground mr-1">
                        {t.fontSize}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full bg-background/50 hover:bg-background shadow-sm"
                            onClick={() => setFontSizeLevel(prev => Math.max(0, prev - 1))}
                            disabled={fontSizeLevel === 0}
                        >
                            <span className="text-sm font-bold">-</span>
                            <span className="sr-only">Decrease font size</span>
                        </Button>
                        <span className="text-xs font-bold w-10 text-center tabular-nums">
                            {fontSizeLevel * 25 + 100}%
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full bg-background/50 hover:bg-background shadow-sm"
                            onClick={() => setFontSizeLevel(prev => Math.min(3, prev + 1))}
                            disabled={fontSizeLevel === 3}
                        >
                            <span className="text-sm font-bold">+</span>
                            <span className="sr-only">Increase font size</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Summary Mode Toggle */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-4 rounded-lg border shadow-sm">
                <div className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                    <span>{t.summaryLevel}</span>
                </div>
                <RadioGroup
                    defaultValue="short"
                    value={summaryMode}
                    onValueChange={(v) => setSummaryMode(v as SummaryMode)}
                    className="flex items-center space-x-4"
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="short" id="short" />
                        <Label htmlFor="short" className="cursor-pointer">{t.short}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="medium" id="medium" />
                        <Label htmlFor="medium" className="cursor-pointer">{t.medium}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="long" id="long" />
                        <Label htmlFor="long" className="cursor-pointer">{t.long}</Label>
                    </div>
                </RadioGroup>
            </div>

            {/* News Grid */}
            <div className="grid gap-6">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} className="animate-pulse">
                            <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
                            <CardContent><Skeleton className="h-24 w-full" /></CardContent>
                        </Card>
                    ))
                ) : news.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        {t.noNews}
                    </div>
                ) : (
                    news.map((item) => (
                        <NewsCard
                            key={item.id}
                            item={item}
                            mode={summaryMode}
                            fontSizeClass={fontSizes[fontSizeLevel]}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

function NewsCard({ item, mode, fontSizeClass }: { item: any, mode: SummaryMode, fontSizeClass: string }) {
    const { language } = useLanguage()
    const t = translations[language].news

    const summaryText = mode === 'short'
        ? item.summaryShort
        : mode === 'medium'
            ? item.summaryMedium
            : item.summaryLong

    // Handle bullet points if text contains proper formatting, otherwise basic split
    const renderContent = (text: string) => {
        if (!text) return <p className="text-muted-foreground">{t.loadingSummary}</p>

        return (
            <div className={`prose dark:prose-invert max-w-none leading-relaxed whitespace-pre-line ${fontSizeClass}`}>
                {text}
            </div>
        )
    }

    return (
        <Card className="overflow-hidden transition-all hover:border-primary/50">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                        <CardTitle className="text-lg sm:text-xl font-bold leading-tight">
                            {item.title}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary" className="font-normal">{item.source}</Badge>
                            <span>•</span>
                            <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ko })}</span>
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="bg-muted/30 p-4 mb-2 rounded-md">
                {renderContent(summaryText)}
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
