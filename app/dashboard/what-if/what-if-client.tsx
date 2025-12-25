'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Calendar as CalendarIcon, TrendingUp, TrendingDown, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { useLanguage } from '@/lib/i18n/context'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useDebounce } from '@/lib/hooks/use-debounce'

interface Stock {
    id: string
    stockCode: string
    stockName: string
    market?: string
}

interface ChartData {
    date: string
    close: number
    open: number
    high: number
    low: number
    volume: number
}

export function WhatIfClient() {
    const { t, language } = useLanguage()

    // Default to 1 year ago
    const [startDate, setStartDate] = React.useState<Date | undefined>(() => {
        const d = new Date()
        d.setFullYear(d.getFullYear() - 1)
        return d
    })

    const [selectedStock, setSelectedStock] = React.useState<Stock | null>(null)
    const [chartData, setChartData] = React.useState<ChartData[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    // Debounced date input to prevent jumping while typing
    const [dateInput, setDateInput] = React.useState<string>(() => {
        const d = new Date()
        d.setFullYear(d.getFullYear() - 1)
        return format(d, 'yyyy-MM-dd')
    })
    const debouncedDateInput = useDebounce(dateInput, 1000)

    // Sync dateInput when startDate changes externally (e.g. weekend fix)
    React.useEffect(() => {
        if (startDate) {
            const str = format(startDate, 'yyyy-MM-dd')
            if (str !== dateInput) {
                setDateInput(str)
            }
        }
    }, [startDate])

    // Update startDate when debounced input changes and is valid
    React.useEffect(() => {
        if (!debouncedDateInput) return

        const d = new Date(debouncedDateInput)
        if (!isNaN(d.getTime())) {
            // Prevent updates for incomplete years (e.g. user typed '0020' or '0202')
            // Only update if year is reasonable (e.g. > 1900)
            if (d.getFullYear() > 1900) {
                if (!startDate || d.getTime() !== startDate.getTime()) {
                    setStartDate(d)
                }
            }
        }
    }, [debouncedDateInput])

    // Derived stats
    const firstPrice = chartData.length > 0 ? chartData[0].close : 0
    const lastPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : 0
    const profitRate = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0
    const profitAmount = lastPrice - firstPrice
    const isProfit = profitAmount >= 0

    React.useEffect(() => {
        async function fetchData() {
            if (!selectedStock || !startDate) return

            setLoading(true)
            setError(null)

            try {
                const endDate = new Date().toISOString().split('T')[0]
                const startStr = format(startDate, 'yyyy-MM-dd')

                const query = new URLSearchParams({
                    symbol: selectedStock.stockCode,
                    market: selectedStock.market || 'KOSPI', // Default fallback
                    startDate: startStr,
                    endDate: endDate,
                })

                const res = await fetch(`/api/stocks/chart?${query.toString()}`)
                const data = await res.json()

                if (data.success) {
                    if (data.data.length === 0) {
                        setError(language === 'ko' ? '해당 기간의 데이터가 없습니다.' : 'No data found for this period.')
                        setChartData([])
                    } else {
                        setChartData(data.data)

                        // If the first data point date is different from the requested startDate
                        // (e.g., requested a Sunday, but first data point is Friday or Monday),
                        // sync the local startDate state for UI consistency.
                        const firstDataPointDate = new Date(data.data[0].date)
                        const requestedDateStr = format(startDate, 'yyyy-MM-dd')
                        const actualDateStr = data.data[0].date

                        if (requestedDateStr !== actualDateStr) {
                            setStartDate(firstDataPointDate)
                        }
                    }
                } else {
                    setError(data.error?.message || 'Failed to fetch data')
                    setChartData([])
                }
            } catch (err) {
                console.error('Failed to fetch chart data:', err)
                setError('Network error occurred')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [selectedStock, startDate, language])

    const formatCurrency = (value: number) => {
        if (!selectedStock) return value.toLocaleString()
        // Simple currency detection based on market (not perfect but sufficient for now)
        const isUS = selectedStock.market === 'US' || selectedStock.market === 'NAS' || selectedStock.market === 'NYS'
        return new Intl.NumberFormat(language === 'ko' ? 'ko-KR' : 'en-US', {
            style: 'currency',
            currency: isUS ? 'USD' : 'KRW',
        }).format(value)
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight">
                    {t('whatIf')}
                </h1>
                <p className="text-muted-foreground text-sm font-medium text-emerald-600">
                    {t('whatIfDesc')}
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[280px_1fr]">
                {/* Controls */}
                <div className="space-y-4">
                    <Card>
                        <CardContent className="p-4 space-y-3">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('stock')}</label>
                                <StockSearchCombobox
                                    value={selectedStock ? selectedStock.stockName : ''}
                                    onSelect={setSelectedStock}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">{language === 'ko' ? '매수 시점' : 'Buy Date'}</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={dateInput}
                                        onChange={(e) => setDateInput(e.target.value)}
                                        max={new Date().toISOString().split('T')[0]}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Result Summary Card (Only show if data exists) */}
                    {!loading && chartData.length > 0 && (
                        <Card className={cn("border-l-4", isProfit ? "border-l-red-500" : "border-l-blue-500")}>
                            <CardHeader className="pb-2">
                                <CardDescription>{language === 'ko' ? '만약 그때 샀다면 현재...' : 'If you bought it then...'}</CardDescription>
                                <CardTitle className={cn("text-2xl", isProfit ? "text-red-600" : "text-blue-600")}>
                                    {profitRate > 0 ? '+' : ''}{profitRate.toFixed(2)}%
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm text-muted-foreground space-y-1">
                                    <div className="flex justify-between">
                                        <span>{language === 'ko' ? '당시 주가' : 'Past Price'}</span>
                                        <span className="font-mono">{formatCurrency(firstPrice)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-foreground">
                                        <span>{language === 'ko' ? '현재 주가' : 'Current Price'}</span>
                                        <span className="font-mono">{formatCurrency(lastPrice)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Chart Area */}
                <div className="min-h-[400px]">
                    {loading ? (
                        <Card className="h-full">
                            <CardHeader>
                                <Skeleton className="h-8 w-[200px]" />
                            </CardHeader>
                            <CardContent className="h-[400px] flex items-center justify-center">
                                <Skeleton className="h-[350px] w-full" />
                            </CardContent>
                        </Card>
                    ) : error ? (
                        <Alert variant="destructive">
                            <Info className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : chartData.length > 0 ? (
                        <Card className="h-full">
                            <CardHeader>
                                <CardTitle>{selectedStock?.stockName} ({selectedStock?.stockCode})</CardTitle>
                                <CardDescription>
                                    {format(new Date(chartData[0].date), 'yyyy.MM.dd')} - {format(new Date(chartData[chartData.length - 1].date), 'yyyy.MM.dd')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pl-0">
                                <div className="h-[400px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart
                                            data={chartData}
                                            margin={{
                                                top: 10,
                                                right: 30,
                                                left: 0,
                                                bottom: 0,
                                            }}
                                        >
                                            <defs>
                                                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={isProfit ? "#ef4444" : "#3b82f6"} stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor={isProfit ? "#ef4444" : "#3b82f6"} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                tickFormatter={(str) => {
                                                    const date = new Date(str);
                                                    return format(date, "MM.dd");
                                                }}
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <YAxis
                                                domain={['auto', 'auto']}
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(val) => val.toLocaleString()}
                                            />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                labelFormatter={(label) => format(new Date(label), 'yyyy년 MM월 dd일')}
                                                formatter={(value: number) => [formatCurrency(value), selectedStock?.stockName]}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="close"
                                                stroke={isProfit ? "#ef4444" : "#3b82f6"}
                                                fillOpacity={1}
                                                fill="url(#colorClose)"
                                                animationDuration={2000}
                                                animationEasing="ease-in-out"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="h-full flex items-center justify-center p-8 bg-muted/20 border-dashed">
                            <div className="text-center space-y-2">
                                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
                                <h3 className="text-lg font-medium">{language === 'ko' ? '종목을 선택해주세요' : 'Select a stock'}</h3>
                                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                    {language === 'ko'
                                        ? '좌측 설정 패널에서 종목과 매수 시점을 선택하면 시뮬레이션 결과가 여기에 표시됩니다.'
                                        : 'Select a stock and buy date from the settings panel to see the simulation result.'}
                                </p>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
