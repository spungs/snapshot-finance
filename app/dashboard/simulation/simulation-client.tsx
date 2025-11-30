'use client'

import { useState } from 'react'
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
import { formatCurrency, formatProfitRate, formatDate } from '@/lib/utils/formatters'
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

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
        error?: string
    }[]
}

interface SimulationClientProps {
    initialSnapshots: any[]
}

import { useLanguage } from '@/lib/i18n/context'

export default function SimulationClient({ initialSnapshots }: SimulationClientProps) {
    const { t } = useLanguage()
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('')
    const [result, setResult] = useState<SimulationResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const runSimulation = async () => {
        if (!selectedSnapshotId) return

        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const res = await fetch('/api/simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshotId: selectedSnapshotId }),
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
                <CardContent className="flex gap-4 items-end">
                    <div className="flex-1 max-w-sm">
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
                    <Button onClick={runSimulation} disabled={!selectedSnapshotId || loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('calculating')}
                            </>
                        ) : (
                            t('runSimulation')
                        )}
                    </Button>
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
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">{t('pastValue')}</CardTitle>
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
                        <Card className={result.totalGain >= 0 ? "border-green-200 bg-green-50 dark:bg-green-900/20" : "border-red-200 bg-red-50 dark:bg-red-900/20"}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">{t('virtualProfit')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold flex items-center ${result.totalGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {result.totalGain >= 0 ? <TrendingUp className="mr-2 h-6 w-6" /> : <TrendingDown className="mr-2 h-6 w-6" />}
                                    {formatCurrency(result.totalGain)}
                                </div>
                                <p className={`text-xs font-medium ${result.totalGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {formatProfitRate(result.totalGainRate)}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t('holdingsComparison')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('stockName')}</TableHead>
                                        <TableHead className="text-right">{t('quantity')}</TableHead>
                                        <TableHead className="text-right">{t('pastPrice')}</TableHead>
                                        <TableHead className="text-right">{t('currentPrice')}</TableHead>
                                        <TableHead className="text-right">{t('pl')}</TableHead>
                                        <TableHead className="text-right">{t('returnRate')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {result.holdings.map((item) => (
                                        <TableRow key={item.stockCode}>
                                            <TableCell>
                                                <div className="font-medium">{item.stockName}</div>
                                                <div className="text-xs text-muted-foreground">{item.stockCode}</div>
                                            </TableCell>
                                            <TableCell className="text-right">{item.quantity}{t('countUnit')}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.snapshotPrice)}</TableCell>
                                            <TableCell className="text-right">
                                                {item.error ? (
                                                    <span className="text-red-500 text-xs">{t('fetchFailed')}</span>
                                                ) : (
                                                    formatCurrency(item.currentPrice)
                                                )}
                                            </TableCell>
                                            <TableCell className={`text-right font-medium ${item.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCurrency(item.gain)}
                                            </TableCell>
                                            <TableCell className={`text-right ${item.gainRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatProfitRate(item.gainRate)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
