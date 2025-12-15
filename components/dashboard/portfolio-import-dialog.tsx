'use client'

import { formatCurrency } from '@/lib/utils/formatters'
import { Currency } from '@/lib/currency/context'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AlertCircle, ArrowRight, Loader2, RefreshCw, CheckCircle2, AlertTriangle, PlusCircle, Trash2, Search } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { analyzeBulkImport, executeBulkImport, AnalyzedItem, updateCashBalance } from '@/app/actions/admin-actions'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from "@/components/ui/scroll-area"
import { FormattedNumberInput } from '@/components/ui/formatted-number-input'

interface PortfolioImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    currentCash?: number
    currency?: Currency
    onUpdate?: () => void
}

export function PortfolioImportDialog({ open, onOpenChange, currentCash = 0, currency = 'KRW', onUpdate }: PortfolioImportDialogProps) {
    const { language } = useLanguage()
    const t = translations[language]

    // State
    const [rawText, setRawText] = useState('')
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [isExecuting, setIsExecuting] = useState(false)
    const [analysisResult, setAnalysisResult] = useState<{
        resolved: AnalyzedItem[],
        unresolved: AnalyzedItem[]
    } | null>(null)
    const [activeTab, setActiveTab] = useState('import')
    const [reviewTab, setReviewTab] = useState('unresolved')
    const [strategy, setStrategy] = useState<'overwrite' | 'add'>('add')
    const [cashAmount, setCashAmount] = useState('')
    const [isUpdatingCash, setIsUpdatingCash] = useState(false)

    // Handlers
    const handleAnalyze = async () => {
        setIsAnalyzing(true)
        setAnalysisResult(null)
        try {
            // 1. Client-side parse similar to before
            const lines = rawText.trim().split('\n')
            const items = lines.map((line) => {
                // Try JSON
                if (line.trim().startsWith('{')) {
                    try {
                        const json = JSON.parse(line)
                        return {
                            identifier: (json.code || json.name || 'Unknown').toString().toUpperCase(),
                            quantity: Number(json.qty || json.quantity || 0),
                            averagePrice: Number(json.price || json.avgPrice || 0),
                        }
                    } catch (e) { }
                }

                // Try Text
                const parts = line.split(/[\t,\|]+|\s{2,}/).map(p => p.trim()).filter(Boolean)
                const finalParts = parts.length >= 3 ? parts : line.split(/\s+/).filter(Boolean)

                if (finalParts.length < 3) return null

                const priceStr = finalParts[finalParts.length - 1]
                const qtyStr = finalParts[finalParts.length - 2]
                const nameParts = finalParts.slice(0, finalParts.length - 2)
                const nameOrCode = nameParts.join(' ')

                return {
                    identifier: nameOrCode.toUpperCase(),
                    quantity: Number(qtyStr.replace(/,/g, '')),
                    averagePrice: Number(priceStr.replace(/,/g, ''))
                }
            }).filter(Boolean) as any[]

            if (items.length === 0) {
                toast.error(t.portfolioManage.parsingFailed)
                setIsAnalyzing(false)
                return
            }

            // 2. Server-side Analyze
            const result = await analyzeBulkImport(items)

            if (result.success) {
                setAnalysisResult({
                    resolved: result.resolved,
                    unresolved: result.unresolved
                })
                // Auto switch to review tab
                setReviewTab(result.unresolved.length > 0 ? 'unresolved' : 'ready')
            } else {
                toast.error(t.portfolioManage.failed, { description: result.error })
            }

        } catch (error) {
            console.error(error)
            toast.error(t.portfolioManage.failed)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleExecute = async () => {
        if (!analysisResult) return
        setIsExecuting(true)
        try {
            const validItems = analysisResult.resolved.map(item => ({
                identifier: item.stockCode!, // We resolved it to stockCode
                quantity: item.inputQty,
                averagePrice: item.inputPrice
            }))

            if (validItems.length === 0) {
                toast.error(t.portfolioManage.nothingToImport)
                return
            }

            const result = await executeBulkImport(validItems, strategy)

            if (result.success) {
                toast.success(t.portfolioManage.importSuccess, {
                    description: t.portfolioManage.importSuccessDesc.replace('{count}', String(result.count)),
                })
                onOpenChange(false)
                // Reset state
                setRawText('')
                setAnalysisResult(null)
            } else {
                toast.error(t.portfolioManage.importFailed, { description: result.error })
            }
        } catch (e) {
            toast.error(t.portfolioManage.failed)
        } finally {
            setIsExecuting(false)
        }
    }

    // Helper to move item from unresolved to resolved (Manual Fix simulation)
    // Real implementation would need a stock search dialog. For now, let's allow editing the identifier and re-analyzing.
    // Actually, re-analyzing is the easiest way.
    // Let's implement a simple "Edit Identifier" for unresolved items in the list.

    const handleUpdateCash = async () => {
        const amount = Number(cashAmount.replace(/,/g, ''))
        if (isNaN(amount)) {
            toast.error(t.portfolioManage.invalidAmount)
            return
        }

        setIsUpdatingCash(true)
        try {
            const result = await updateCashBalance(amount)
            if (result.success) {
                toast.success(t.portfolioManage.cashUpdated)
                setCashAmount('')
                onUpdate?.()
            } else {
                toast.error(t.portfolioManage.failed, { description: result.error })
            }
        } catch (e) {
            toast.error(t.portfolioManage.failed)
        } finally {
            setIsUpdatingCash(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t.portfolioManage.title}</DialogTitle>
                    <DialogDescription>
                        {t.portfolioManage.desc}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="import">{t.portfolioManage.bulkImport}</TabsTrigger>
                        <TabsTrigger value="cash">{t.portfolioManage.cashBalance}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="import" className="flex-1 flex flex-col gap-4 overflow-hidden pt-4">
                        {!analysisResult ? (
                            // Phase 1: Input
                            <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-1">
                                <Alert>
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>{t.portfolioManage.formatInstructions}</AlertTitle>
                                    <AlertDescription className="whitespace-pre-wrap">
                                        {t.portfolioManage.formatDesc}
                                    </AlertDescription>
                                </Alert>

                                <div className="grid gap-2 flex-1">
                                    <Label>{t.portfolioManage.rawData}</Label>
                                    <Textarea
                                        placeholder={t.portfolioManage.pastePlaceholder}
                                        className="flex-1 font-mono text-sm min-h-[200px]"
                                        value={rawText}
                                        onChange={(e) => setRawText(e.target.value)}
                                    />
                                </div>

                                <div className="flex justify-end gap-2">
                                    <Button onClick={handleAnalyze} disabled={!rawText.trim() || isAnalyzing}>
                                        {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                        {t.portfolioManage.parsePreview}
                                    </Button>
                                    <Button variant="outline" onClick={() => setRawText('')} disabled={!rawText}>
                                        {t.portfolioManage.clear}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            // Phase 2: Review
                            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-lg">{t.portfolioManage.analysisResult}</h3>
                                    <Button variant="ghost" size="sm" onClick={() => setAnalysisResult(null)}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        {t.portfolioManage.rewrite}
                                    </Button>
                                </div>

                                <Tabs value={reviewTab} onValueChange={setReviewTab} className="flex-1 flex flex-col overflow-hidden">
                                    <TabsList className="w-full justify-start">
                                        <TabsTrigger value="unresolved" className="relative">
                                            {t.portfolioManage.tabUnresolved.replace('{count}', String(analysisResult.unresolved.length))}
                                            {analysisResult.unresolved.length > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-red-500" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="ready">
                                            {t.portfolioManage.tabReady.replace('{count}', String(analysisResult.resolved.length))}
                                            {analysisResult.resolved.length > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-green-500" />}
                                        </TabsTrigger>
                                    </TabsList>

                                    {/* Unresolved Tab */}
                                    <TabsContent value="unresolved" className="flex-1 overflow-hidden data-[state=inactive]:hidden">
                                        <ScrollArea className="h-full border rounded-md p-4">
                                            {analysisResult.unresolved.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                                                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                                                    <p>{t.portfolioManage.noUnresolved}</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    <Alert variant="destructive" className="flex items-center gap-3 [&>svg]:relative [&>svg]:top-auto [&>svg]:left-auto [&>svg]:transform-none py-3 px-4 [&>svg~*]:pl-0">
                                                        <AlertTriangle className="h-4 w-4" />
                                                        <AlertTitle className="mb-0">{t.portfolioManage.fixTypos}</AlertTitle>
                                                    </Alert>
                                                    {analysisResult.unresolved.map((item, idx) => (
                                                        <Card key={idx}>
                                                            <CardContent className="p-4 flex items-center gap-4">
                                                                <div className="flex-1">
                                                                    <div className="font-bold text-red-500">{item.identifier}</div>
                                                                    <div className="text-sm text-muted-foreground">
                                                                        Qty: {item.inputQty} / Price: {item.inputPrice.toLocaleString()}
                                                                    </div>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    {/* Ideally a search dialog here. For MVP, we instruct user to fix raw text */}
                                                                    <Button variant="outline" size="sm" onClick={() => {
                                                                        setRawText(prev => prev.replace(item.identifier, '')) // Helper? No, complex logic.
                                                                        // Better: Just copy to clipboard or focus
                                                                        toast.info("Please fix this typo in the raw text step.")
                                                                        setAnalysisResult(null) // Go back
                                                                    }}>
                                                                        {t.portfolioManage.fixInRawView}
                                                                    </Button>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ))}
                                                </div>
                                            )}
                                        </ScrollArea>
                                    </TabsContent>

                                    {/* Ready Tab */}
                                    <TabsContent value="ready" className="flex-1 overflow-hidden data-[state=inactive]:hidden flex flex-col gap-4">
                                        <ScrollArea className="flex-1 border rounded-md">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-muted sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-2">{t.portfolioManage.nameCode}</th>
                                                        <th className="p-2 text-right">{t.quantity}</th>
                                                        <th className="p-2 text-right">{t.avgPrice}</th>
                                                        <th className="p-2 text-center">{t.portfolioManage.diff}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {analysisResult.resolved.map((item, idx) => {
                                                        const isOverwrite = strategy === 'overwrite'
                                                        const newQty = isOverwrite ? item.inputQty : (item.currentQty + item.inputQty)
                                                        const qtyDiff = newQty - item.currentQty
                                                        const isUpdate = item.currentQty > 0

                                                        return (
                                                            <tr key={idx} className="border-t hover:bg-muted/50">
                                                                <td className="p-2">
                                                                    <div className="font-medium">{item.stockName}</div>
                                                                    <div className="text-xs text-muted-foreground font-mono flex gap-1">
                                                                        <span>{item.stockCode}</span>
                                                                        {item.currency && (
                                                                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                                                                {item.currency}
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 text-right">
                                                                    {item.inputQty}
                                                                </td>
                                                                <td className="p-2 text-right">{item.inputPrice.toLocaleString()}</td>
                                                                <td className="p-2 text-right">
                                                                    {isUpdate ? (
                                                                        <div className="flex flex-col items-end text-xs">
                                                                            <span className="text-muted-foreground">{item.currentQty} → <b>{newQty}</b></span>
                                                                            <span className={qtyDiff > 0 ? "text-green-600" : "text-red-500"}>
                                                                                ({qtyDiff > 0 ? '+' : ''}{qtyDiff})
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <Badge variant="secondary" className="bg-green-100 text-green-800">New</Badge>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </ScrollArea>

                                        <div className="border-t pt-4 space-y-4">
                                            <div className="space-y-2">
                                                <Label>{t.portfolioManage.strategy}</Label>
                                                <RadioGroup value={strategy} onValueChange={(v: any) => setStrategy(v)} className="flex flex-col gap-2">
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="add" id="st-add" />
                                                        <Label htmlFor="st-add">{t.portfolioManage.strategyAdd}</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="overwrite" id="st-overwrite" />
                                                        <Label htmlFor="st-overwrite">{t.portfolioManage.strategyOverwrite}</Label>
                                                    </div>
                                                </RadioGroup>
                                            </div>

                                            <div className="flex justify-end pt-2">
                                                <Button onClick={handleExecute} disabled={isExecuting || analysisResult.resolved.length === 0} className="w-full sm:w-auto">
                                                    {isExecuting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                    {t.portfolioManage.executeImport} ({analysisResult.resolved.length})
                                                </Button>
                                            </div>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="cash" className="space-y-4">
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-muted/50 border flex justify-between items-center">
                                <span className="text-sm font-medium text-muted-foreground">{t.portfolioManage.currentCash}</span>
                                <span className="text-lg font-bold">{formatCurrency(currentCash, currency)}</span>
                            </div>

                            <div className="grid gap-2">
                                <Label>{t.portfolioManage.cashUpdateLabel}</Label>
                                <div className="flex gap-2">
                                    <FormattedNumberInput
                                        placeholder={t.portfolioManage.cashUpdatePlaceholder}
                                        value={cashAmount}
                                        onChange={setCashAmount}
                                    />
                                    <Button onClick={handleUpdateCash} disabled={!cashAmount || isUpdatingCash}>
                                        {isUpdatingCash && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {t.portfolioManage.update}
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{t.portfolioManage.cashHelper}</p>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
