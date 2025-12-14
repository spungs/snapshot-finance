'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatProfitRate, formatDate, formatNumber } from '@/lib/utils/formatters'
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useLanguage } from '@/lib/i18n/context'

interface SimulationResult {
    snapshotDate: string
    totalOriginalValue: number
    totalSimulatedValue: number
    totalGain: number
    totalGainRate: number
    holdings: {
        stockName: string
        stockCode: string
        quantity: number
        snapshotPrice: number
        currentPrice: number
        originalValue: number
        simulatedValue: number
        gain: number
        gainRate: number
        gainKRW?: number
        gainRateKRW?: number
        simulatedValueKRW?: number
        currency: string
        error?: string
    }[]
    exchangeRate: number
    snapshotExchangeRate: number
}

interface SimulationClientProps {
    initialSnapshots: any[]
}


export default function SimulationClient({ initialSnapshots }: SimulationClientProps) {
    const { t, language } = useLanguage()
    const searchParams = useSearchParams()
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('')
    const [result, setResult] = useState<SimulationResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const selectedSnapshot = initialSnapshots.find(s => s.id === selectedSnapshotId)
    const snapshotProfit = selectedSnapshot ? Number(selectedSnapshot.totalProfit) : 0
    const profitDiff = result ? result.totalGain - snapshotProfit : 0

    useEffect(() => {
        const id = searchParams.get('snapshotId')
        if (id) {
            setSelectedSnapshotId(id)
            executeSimulation(id)
        }
    }, [searchParams])

    const executeSimulation = async (id: string) => {
        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const res = await fetch('/api/simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshotId: id }),
            })
            const data = await res.json()

            if (data.success) {
                setResult(data.data)
            } else {
                setError(data.error || t('simulationFailed'))
            }
        } catch (err) {
            setError(t('runSimulationFailed'))
        } finally {
            setLoading(false)
        }
    }

    const runSimulation = () => {
        if (!selectedSnapshotId) return
        executeSimulation(selectedSnapshotId)
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{t('simulationTitle')}</h1>
                <p className="text-muted-foreground">
                    {t('simulationDesc')}
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('selectSnapshot')}</CardTitle>
                    <CardDescription>
                        {t('selectSnapshotDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center">
                        <div className="w-full sm:w-auto sm:min-w-[320px]">
                            <Select value={selectedSnapshotId} onValueChange={setSelectedSnapshotId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('selectSnapshotPlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {initialSnapshots.map((snap) => {
                                        const isEn = language === 'en'
                                        let displayValue = Number(snap.totalValue)
                                        let currency = 'KRW'

                                        if (isEn && snap.exchangeRate) {
                                            displayValue = displayValue / snap.exchangeRate
                                            currency = 'USD'
                                        }

                                        const dateStr = formatDate(snap.snapshotDate)
                                        const assetStr = `${t('totalAssets')}: ${formatCurrency(displayValue, currency)}`

                                        // User Request: Show Note first if exists
                                        const label = snap.note
                                            ? `${dateStr} | ${snap.note}`
                                            : dateStr

                                        return (
                                            <SelectItem key={snap.id} value={snap.id}>
                                                <span className="block truncate max-w-[260px] sm:max-w-none">
                                                    {label} ({assetStr})
                                                </span>
                                            </SelectItem>
                                        )
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={runSimulation} disabled={!selectedSnapshotId || loading} className="w-full sm:w-auto">
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('calculating')}
                                </>
                            ) : (
                                t('runSimulation')
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('error')}</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {result && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Currency Calculation */}
                    {(() => {
                        const isEn = language === 'en'
                        const currency = isEn ? 'USD' : 'KRW'

                        // Cost Basis (Total Invested)
                        // This corresponds to the user's initial investment
                        const totalInvested = isEn && result.snapshotExchangeRate
                            ? result.totalOriginalValue / result.snapshotExchangeRate
                            : result.totalOriginalValue

                        // Current Value (Simulated Today)
                        // Current Stock Value
                        const currentStockValue = isEn && result.exchangeRate
                            ? result.totalSimulatedValue / result.exchangeRate
                            : result.totalSimulatedValue

                        // Current Cash Value (Assuming Cash is held as is)
                        // If EN, we convert the KRW cash to USD at CURRENT rate (buying power today)
                        const cashBalance = selectedSnapshot ? Number(selectedSnapshot.cashBalance) : 0
                        const currentCashValue = isEn && result.exchangeRate
                            ? cashBalance / result.exchangeRate
                            : cashBalance

                        const currentTotalValue = currentStockValue // User requested to exclude cash

                        // Profit is simple difference in the target currency (Holdings Only? Or Total?)
                        // If we compare Total Assets, we should use Total gain.
                        // totalGain (Stock Only) = CurrentStock - Cost
                        // But for "Simulation Difference", we want TotalAssetNow - TotalAssetThen.

                        // Snapshot Value (Value at the time of snapshot)
                        // This includes Cash.
                        const snapshotValuationVal = selectedSnapshot ? Number(selectedSnapshot.totalValue) : 0
                        const displaySnapshotValue = isEn && result.snapshotExchangeRate
                            ? snapshotValuationVal / result.snapshotExchangeRate
                            : snapshotValuationVal

                        // Snapshot Cash Value (for display in Past Value card)
                        const snapshotCashValue = isEn && result.snapshotExchangeRate
                            ? cashBalance / result.snapshotExchangeRate
                            : cashBalance

                        // Profits Calculation

                        // 1. Total Gain (Current Value - Cost)
                        // Cost doesn't include cash usually. 
                        // But Total Asset Value includes Cash.
                        // So (Stock + Cash) - Cost = Gain.
                        const totalGain = currentTotalValue - totalInvested

                        // 2. Snapshot Profit (Snapshot Value - Cost)
                        const snapshotProfitVal = selectedSnapshot ? Number(selectedSnapshot.totalProfit) : 0
                        const snapshotProfit = isEn && result.snapshotExchangeRate
                            ? snapshotProfitVal / result.snapshotExchangeRate
                            : snapshotProfitVal

                        // 3. Simulation Difference (Current Value - Snapshot Value)
                        const profitDiff = currentTotalValue - displaySnapshotValue

                        // 4. Simulation Yield (Difference / Snapshot Value)
                        const simulationYield = displaySnapshotValue ? (profitDiff / displaySnapshotValue) * 100 : 0

                        return (
                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">{t('pastValue')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-xs text-muted-foreground mb-1">{t('evaluatedValue')}</div>
                                        <div className="text-2xl font-bold">{formatCurrency(displaySnapshotValue, currency)}</div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {formatDate(result.snapshotDate)} {t('basedOn')}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1 border-t pt-1 w-fit">
                                            {t('totalInvested')}: {formatCurrency(totalInvested, currency)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1 w-fit">
                                            {t('cash')}: {formatCurrency(snapshotCashValue, currency)}
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">{t('currentValue')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-xs text-muted-foreground mb-1">{t('evaluatedValue')}</div>
                                        <div className="text-2xl font-bold">{formatCurrency(currentTotalValue, currency)}</div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {t('basedOnRealtime')} <span className="text-[10px] text-muted-foreground">({t('exclCash')})</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1 border-t pt-1 w-fit opacity-0" aria-hidden="true">
                                            {t('totalInvested')}: {formatCurrency(totalInvested, currency)}
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card className={profitDiff >= 0 ? "border-profit/20 bg-profit/5 dark:bg-profit/10" : "border-loss/20 bg-loss/5 dark:bg-loss/10"}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">{t('simulationResult')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className={`text-2xl font-bold flex items-center ${profitDiff >= 0 ? "text-profit" : "text-loss"}`}>
                                            {profitDiff >= 0 ? <TrendingUp className="mr-2 h-6 w-6" /> : <TrendingDown className="mr-2 h-6 w-6" />}
                                            {formatCurrency(Math.abs(profitDiff), currency)}
                                        </div>
                                        <p className={`text-xs font-medium ${profitDiff >= 0 ? "text-profit" : "text-loss"}`}>
                                            {formatProfitRate(simulationYield)}
                                        </p>

                                        <div className="mt-4 pt-4 border-t space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">
                                                    {t('currentPL')}
                                                </span>
                                                <span className={totalGain >= 0 ? "text-profit" : "text-loss"}>
                                                    {formatCurrency(totalGain, currency)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">
                                                    {t('snapshotPL')}
                                                </span>
                                                <span className={snapshotProfit >= 0 ? "text-profit" : "text-loss"}>
                                                    {formatCurrency(snapshotProfit, currency)}
                                                </span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )
                    })()}

                    <Card>
                        <CardHeader>
                            <CardTitle>{t('holdingsComparison')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="md:hidden space-y-4">
                                {result.holdings.map((item, index) => {
                                    const isEn = language === 'en'
                                    const rate = result.exchangeRate || 1435
                                    const snapshotRate = result.snapshotExchangeRate || 1

                                    let displayCurrency = item.currency
                                    let displayCurrentPrice = item.currentPrice
                                    let displayAvgPrice = item.snapshotPrice
                                    let displayGain = item.gain

                                    if (isEn) {
                                        displayCurrency = 'USD'
                                        if (item.currency === 'KRW') {
                                            displayCurrentPrice = item.currentPrice / rate
                                        }
                                        if (item.currency === 'KRW') {
                                            displayAvgPrice = item.snapshotPrice / snapshotRate
                                        }
                                        const valNowUSD = item.currency === 'KRW' ? (item.currentPrice * item.quantity) / rate : (item.currentPrice * item.quantity)
                                        const valThenUSD = item.currency === 'KRW' ? (item.snapshotPrice * item.quantity) / snapshotRate : (item.snapshotPrice * item.quantity)
                                        displayGain = valNowUSD - valThenUSD
                                    }

                                    return (
                                        <div key={`mobile-${item.stockCode}-${index}`} className="bg-muted/40 rounded-lg p-4 border space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-semibold">{item.stockName}</div>
                                                    <div className="text-sm text-muted-foreground">{item.stockCode}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`font-medium ${displayGain >= 0 ? 'text-profit' : 'text-loss'}`}>
                                                        {formatCurrency(Math.abs(displayGain), displayCurrency)}
                                                    </div>
                                                    {displayCurrency === 'USD' && item.gainKRW !== undefined && (
                                                        <div className={`text-xs ${item.gainKRW >= 0 ? 'text-profit/70' : 'text-loss/70'} mt-0.5`}>
                                                            ({formatCurrency(Math.abs(item.gainKRW), 'KRW')})
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t pt-3">
                                                <div>
                                                    <div className="text-xs text-muted-foreground mb-1">{t('quantity')}</div>
                                                    <div className="font-medium">{formatNumber(item.quantity)}{t('countUnit')}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-muted-foreground mb-1">{t('returnRate')}</div>
                                                    <div className={`${item.gainRate >= 0 ? 'text-profit' : 'text-loss'} font-medium`}>
                                                        {formatProfitRate(item.gainRate)}
                                                    </div>
                                                    {displayCurrency === 'USD' && item.gainRateKRW !== undefined && (
                                                        <div className={`text-xs ${item.gainRateKRW >= 0 ? 'text-profit/70' : 'text-loss/70'} mt-0.5`}>
                                                            ({formatProfitRate(item.gainRateKRW)})
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-muted-foreground mb-1">{t('weight')}</div>
                                                    <div className="font-medium">
                                                        {formatNumber(((item.simulatedValueKRW || 0) / result.totalSimulatedValue) * 100, 1)}%
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted-foreground mb-1">{t('avgPrice')}</div>
                                                    <div className="font-medium">{formatCurrency(displayAvgPrice, displayCurrency)}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-muted-foreground mb-1">{t('currentPrice')}</div>
                                                    <div className="font-medium">
                                                        {item.error ? (
                                                            <span className="text-destructive text-xs">{t('fetchFailed')}</span>
                                                        ) : (
                                                            formatCurrency(displayCurrentPrice, displayCurrency)
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="hidden md:block overflow-x-auto -mx-6 sm:mx-0">
                                <div className="min-w-[800px] px-6 sm:px-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t('stockName')}</TableHead>
                                                <TableHead className="text-right">{t('quantity')}</TableHead>
                                                <TableHead className="text-right">{t('avgPrice')}</TableHead>
                                                <TableHead className="text-right">{t('currentPrice')}</TableHead>
                                                <TableHead className="text-right">{t('pl')}</TableHead>
                                                <TableHead className="text-right">{t('returnRate')}</TableHead>
                                                <TableHead className="text-right">{t('weight')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {result.holdings.map((item, index) => {
                                                const isEn = language === 'en'

                                                // For Table:
                                                // If EN, show converted values in USD for EVERYTHING (unified view).
                                                // Or should we keep original currency for Price but show USD for Total Value?
                                                // Usually users want to see "How much is this worth in my currency?".
                                                // Let's try to be consistent with the summary.
                                                // If En -> Show USD estimated values.

                                                // Current Price (Native) -> USD
                                                // If item.currency is USD, it is already USD.
                                                // If item.currency is KRW, divide by Current Exchange Rate.

                                                const rate = result.exchangeRate || 1435
                                                const snapshotRate = result.snapshotExchangeRate || 1

                                                // Helper to convert any native value to display currency (USD if En)
                                                // NOTE: item.currentPrice is in item.currency. 
                                                // If item.currency is KRW and we want USD => val / rate.
                                                // If item.currency is USD and we want USD => val.

                                                let displayCurrency = item.currency
                                                let displayCurrentPrice = item.currentPrice
                                                let displayAvgPrice = item.snapshotPrice // Snapshot Price (Cost)
                                                let displayGain = item.gain

                                                if (isEn) {
                                                    displayCurrency = 'USD'

                                                    // Current Price Conversion
                                                    if (item.currency === 'KRW') {
                                                        displayCurrentPrice = item.currentPrice / rate
                                                    }

                                                    // Avg Price (Historical) Conversion
                                                    if (item.currency === 'KRW') {
                                                        displayAvgPrice = item.snapshotPrice / snapshotRate
                                                    }

                                                    // Gain Conversion (Approximation using logic: ValueNow - ValueThen)
                                                    // ValueNow(USD)
                                                    const valNowUSD = item.currency === 'KRW' ? (item.currentPrice * item.quantity) / rate : (item.currentPrice * item.quantity)
                                                    // ValueThen(USD)
                                                    const valThenUSD = item.currency === 'KRW' ? (item.snapshotPrice * item.quantity) / snapshotRate : (item.snapshotPrice * item.quantity)

                                                    displayGain = valNowUSD - valThenUSD
                                                }

                                                return (
                                                    <TableRow key={`${item.stockCode}-${index}`}>
                                                        <TableCell>
                                                            <div className="font-medium">{item.stockName}</div>
                                                            <div className="text-xs text-muted-foreground">{item.stockCode}</div>
                                                        </TableCell>
                                                        <TableCell className="text-right">{formatNumber(item.quantity)}{t('countUnit')}</TableCell>
                                                        <TableCell className="text-right">{formatCurrency(displayAvgPrice, displayCurrency)}</TableCell>
                                                        <TableCell className="text-right">
                                                            {item.error ? (
                                                                <span className="text-destructive text-xs">{t('fetchFailed')}</span>
                                                            ) : (
                                                                formatCurrency(displayCurrentPrice, displayCurrency)
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className={`font-medium ${displayGain >= 0 ? 'text-profit' : 'text-loss'}`}>
                                                                {formatCurrency(Math.abs(displayGain), displayCurrency)}
                                                            </div>
                                                            {displayCurrency === 'USD' && item.gainKRW !== undefined && (
                                                                <div className={`text-xs ${item.gainKRW >= 0 ? 'text-profit/70' : 'text-loss/70'}`}>
                                                                    ({formatCurrency(Math.abs(item.gainKRW), 'KRW')})
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className={`${item.gainRate >= 0 ? 'text-profit' : 'text-loss'}`}>
                                                                {formatProfitRate(item.gainRate)}
                                                            </div>
                                                            {displayCurrency === 'USD' && item.gainRateKRW !== undefined && (
                                                                <div className={`text-xs ${item.gainRateKRW >= 0 ? 'text-profit/70' : 'text-loss/70'}`}>
                                                                    ({formatProfitRate(item.gainRateKRW)})
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(((item.simulatedValueKRW || 0) / result.totalSimulatedValue) * 100, 1)}%
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
