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
        currency: string
        error?: string
    }[]
}

interface SimulationClientProps {
    initialSnapshots: any[]
}


export default function SimulationClient({ initialSnapshots }: SimulationClientProps) {
    const { t } = useLanguage()
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
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1 w-full sm:max-w-sm">
                            <Select value={selectedSnapshotId} onValueChange={setSelectedSnapshotId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('selectSnapshotPlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {initialSnapshots.map((snap) => (
                                        <SelectItem key={snap.id} value={snap.id}>
                                            {formatDate(snap.snapshotDate)} ({t('totalAssets')}: {formatCurrency(Number(snap.totalValue))})
                                        </SelectItem>
                                    ))}
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
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">{t('totalInvested')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(result.totalOriginalValue)}</div>
                                <p className="text-xs text-muted-foreground">{formatDate(result.snapshotDate)} {t('basedOn')}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">{t('currentValue')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(result.totalSimulatedValue)}</div>
                                <p className="text-xs text-muted-foreground">{t('basedOnRealtime')}</p>
                            </CardContent>
                        </Card>
                        <Card className={result.totalGain >= 0 ? "border-red-200 bg-red-50 dark:bg-red-900/20" : "border-blue-200 bg-blue-50 dark:bg-blue-900/20"}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">{t('virtualProfit')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold flex items-center ${result.totalGain >= 0 ? "text-red-600" : "text-blue-600"}`}>
                                    {result.totalGain >= 0 ? <TrendingUp className="mr-2 h-6 w-6" /> : <TrendingDown className="mr-2 h-6 w-6" />}
                                    {formatCurrency(Math.abs(result.totalGain))}
                                </div>
                                <p className={`text-xs font-medium ${result.totalGain >= 0 ? "text-red-600" : "text-blue-600"}`}>
                                    {formatProfitRate(result.totalGainRate)}
                                </p>

                                <div className="mt-4 pt-4 border-t space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            스냅샷 당시 수익
                                            {selectedSnapshot && (
                                                <span className="text-xs ml-1" suppressHydrationWarning>
                                                    ({formatDate(selectedSnapshot.snapshotDate, 'yyyy-MM-dd')})
                                                </span>
                                            )}
                                        </span>
                                        <span className={snapshotProfit >= 0 ? "text-red-600" : "text-blue-600"}>
                                            {formatCurrency(snapshotProfit)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm font-medium">
                                        <span className="text-muted-foreground">차이</span>
                                        <span className={profitDiff >= 0 ? "text-red-600" : "text-blue-600"}>
                                            {profitDiff > 0 ? '+' : ''}{formatCurrency(profitDiff)}
                                            <span className="text-xs ml-1 text-muted-foreground font-normal">
                                                ({profitDiff >= 0 ? '🎉' : '👿'})
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t('holdingsComparison')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto -mx-6 sm:mx-0">
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
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {result.holdings.map((item, index) => (
                                                <TableRow key={`${item.stockCode}-${index}`}>
                                                    <TableCell>
                                                        <div className="font-medium">{item.stockName}</div>
                                                        <div className="text-xs text-muted-foreground">{item.stockCode}</div>
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatNumber(item.quantity)}{t('countUnit')}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(item.snapshotPrice, item.currency)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {item.error ? (
                                                            <span className="text-red-500 text-xs">{t('fetchFailed')}</span>
                                                        ) : (
                                                            formatCurrency(item.currentPrice, item.currency)
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className={`font-medium ${item.gain >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                                            {formatCurrency(Math.abs(item.gain), item.currency)}
                                                        </div>
                                                        {item.currency === 'USD' && (
                                                            <div className={`text-xs ${item.gainKRW! >= 0 ? 'text-red-600/70' : 'text-blue-600/70'}`}>
                                                                ({formatCurrency(Math.abs(item.gainKRW || 0), 'KRW')})
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className={`${item.gainRate >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                                            {formatProfitRate(item.gainRate)}
                                                        </div>
                                                        {item.currency === 'USD' && (
                                                            <div className={`text-xs ${item.gainRateKRW! >= 0 ? 'text-red-600/70' : 'text-blue-600/70'}`}>
                                                                ({formatProfitRate(item.gainRateKRW || 0)})
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
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
