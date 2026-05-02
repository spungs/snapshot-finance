'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StockNewsPanel } from './stock-news-panel'
import { M7, type NewsStock } from '@/lib/news/m7'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

interface NewsTabsClientProps {
    holdings: NewsStock[]
    isAuthed: boolean
}

export function NewsTabsClient({ holdings, isAuthed }: NewsTabsClientProps) {
    const { language } = useLanguage()
    const t = translations[language].news

    const hasMyStocks = holdings.length > 0
    const defaultTab = hasMyStocks ? 'mine' : 'm7'

    return (
        <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="bg-transparent p-0 h-auto gap-1 border-b border-border w-full justify-start rounded-none">
                <TabsTrigger
                    value="mine"
                    disabled={!hasMyStocks}
                    className="rounded-none bg-transparent px-4 py-3 font-serif text-base tracking-tight data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground data-[state=active]:text-foreground text-muted-foreground -mb-px"
                >
                    {t.myStocks}
                    {hasMyStocks && (
                        <span className="ml-2 text-[10px] tracking-[1px] uppercase text-muted-foreground">
                            {holdings.length}
                        </span>
                    )}
                </TabsTrigger>
                <TabsTrigger
                    value="m7"
                    className="rounded-none bg-transparent px-4 py-3 font-serif text-base tracking-tight data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground data-[state=active]:text-foreground text-muted-foreground -mb-px"
                >
                    {t.m7Tab}
                </TabsTrigger>
            </TabsList>

            <TabsContent value="mine" className="mt-6">
                {hasMyStocks ? (
                    <StockNewsPanel symbols={holdings} />
                ) : (
                    <div className="border border-dashed border-border rounded-md py-16 px-6 text-center">
                        <div className="eyebrow mb-3">{t.myStocksEyebrow}</div>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            {isAuthed ? t.noHoldingsHint : t.loginToSeeMyStocks}
                        </p>
                    </div>
                )}
            </TabsContent>

            <TabsContent value="m7" className="mt-6">
                <StockNewsPanel symbols={M7} />
            </TabsContent>
        </Tabs>
    )
}
