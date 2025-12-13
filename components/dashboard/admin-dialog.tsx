'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { bulkImportHoldings, updateCashBalance } from '@/app/actions/admin-actions'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

interface AdminDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface ParsedHolding {
    id: string
    code: string // Can be name or code initially
    qty: number
    price: number
    status: 'pending' | 'valid' | 'invalid'
    error?: string
    resolvedCode?: string
    resolvedName?: string
}

export function AdminDialog({ open, onOpenChange }: AdminDialogProps) {
    const { language } = useLanguage()
    const t = translations[language]

    const [rawText, setRawText] = useState('')
    const [parsedHoldings, setParsedHoldings] = useState<ParsedHolding[]>([])
    const [isParsing, setIsParsing] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [cashAmount, setCashAmount] = useState('')

    // Smart Parser Logic
    const parseText = () => {
        setIsParsing(true)
        try {
            const lines = rawText.trim().split('\n')
            const parsed: ParsedHolding[] = lines.map((line, index) => {
                // Try JSON first if it looks like it
                if (line.trim().startsWith('{')) {
                    try {
                        const json = JSON.parse(line)
                        return {
                            id: `row-${index}`,
                            code: json.code || json.name || 'Unknown',
                            qty: Number(json.qty || json.quantity || 0),
                            price: Number(json.price || json.avgPrice || 0),
                            status: 'pending'
                        }
                    } catch (e) { }
                }

                // Split by common separators: Tab (Excel), Comma, Pipe, or multiple spaces
                const parts = line.split(/[\t,\|]+|\s{2,}/).map(p => p.trim()).filter(Boolean)

                // If parts length < 3, maybe space separated?
                const finalParts = parts.length >= 3 ? parts : line.split(/\s+/).filter(Boolean)

                if (finalParts.length < 3) {
                    return {
                        id: `row-${index}`,
                        code: line,
                        qty: 0,
                        price: 0,
                        status: 'invalid',
                        error: 'Format: [Name/Code] [Qty] [Price]'
                    }
                }

                const priceStr = finalParts[finalParts.length - 1]
                const qtyStr = finalParts[finalParts.length - 2]
                const nameParts = finalParts.slice(0, finalParts.length - 2)
                const nameOrCode = nameParts.join(' ')

                const qty = Number(qtyStr.replace(/,/g, ''))
                const price = Number(priceStr.replace(/,/g, ''))

                if (isNaN(qty) || isNaN(price)) {
                    return {
                        id: `row-${index}`,
                        code: nameOrCode,
                        qty: 0,
                        price: 0,
                        status: 'invalid',
                        error: 'Qty or Price is not a number'
                    }
                }

                return {
                    id: `row-${index}`,
                    code: nameOrCode,
                    qty,
                    price,
                    status: 'pending'
                }
            })
            setParsedHoldings(parsed)
        } catch (error) {
            console.error(error)
            toast.error(t.admin.parsingFailed, {
                description: t.admin.parsingFailedDesc,
            })
        } finally {
            setIsParsing(false)
        }
    }

    const handleImport = async () => {
        setIsImporting(true)
        try {
            const itemsToImport = parsedHoldings.filter(h => h.status !== 'invalid').map(h => ({
                identifier: h.code,
                quantity: h.qty,
                averagePrice: h.price
            }))

            if (itemsToImport.length === 0) {
                toast.error(t.admin.nothingToImport, {
                    description: t.admin.nothingToImportDesc,
                })
                setIsImporting(false)
                return
            }

            const result = await bulkImportHoldings(itemsToImport)

            if (result.success) {
                toast.success(t.admin.importSuccess, {
                    description: t.admin.importSuccessDesc.replace('{count}', String(result.count)),
                })
                onOpenChange(false)
                setRawText('')
                setParsedHoldings([])
            } else {
                if (result.errors) {
                    const newParsed = [...parsedHoldings]
                    result.errors.forEach((err: any) => {
                        const idx = newParsed.findIndex(p => p.code === err.identifier)
                        if (idx !== -1) {
                            newParsed[idx].status = 'invalid'
                            newParsed[idx].error = err.message
                        }
                    })
                    setParsedHoldings(newParsed)
                    toast.error(t.admin.importPartial, {
                        description: t.admin.importCheckErrors,
                    })
                } else {
                    toast.error(t.admin.importFailed, {
                        description: result.error,
                    })
                }
            }

        } catch (error) {
            toast.error(t.admin.failed, {
                description: "Failed to import holdings.",
            })
        } finally {
            setIsImporting(false)
        }
    }

    const handleUpdateCash = async () => {
        const amount = Number(cashAmount.replace(/,/g, ''))
        if (isNaN(amount)) {
            toast.error(t.admin.invalidAmount)
            return
        }

        const result = await updateCashBalance(amount)
        if (result.success) {
            toast.success(t.admin.cashUpdated)
            setCashAmount('')
        } else {
            toast.error(t.admin.failed, { description: result.error })
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t.admin.title}</DialogTitle>
                    <DialogDescription>
                        {t.admin.desc}
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="import" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="import">{t.admin.bulkImport}</TabsTrigger>
                        <TabsTrigger value="cash">{t.admin.cashBalance}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="import" className="space-y-4">
                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t.admin.formatInstructions}</AlertTitle>
                            <AlertDescription className="whitespace-pre-wrap">
                                {t.admin.formatDesc}
                            </AlertDescription>
                        </Alert>

                        <div className="grid gap-2">
                            <Label>{t.admin.rawData}</Label>
                            <Textarea
                                placeholder={t.admin.pastePlaceholder}
                                className="h-32 font-mono text-sm"
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setParsedHoldings([])} disabled={!parsedHoldings.length}>
                                {t.admin.clear}
                            </Button>
                            <Button onClick={parseText} disabled={!rawText.trim()}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {t.admin.parsePreview}
                            </Button>
                        </div>

                        {parsedHoldings.length > 0 && (
                            <div className="border rounded-md overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted">
                                        <tr>
                                            <th className="p-2">{t.admin.nameCode}</th>
                                            <th className="p-2 text-right">{t.quantity}</th>
                                            <th className="p-2 text-right">{t.avgPrice}</th>
                                            <th className="p-2 text-center">{t.admin.status}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedHoldings.map((row) => (
                                            <tr key={row.id} className="border-t">
                                                <td className="p-2 font-mono">{row.code}</td>
                                                <td className="p-2 text-right">{row.qty}</td>
                                                <td className="p-2 text-right">{row.price.toLocaleString()}</td>
                                                <td className="p-2 text-center">
                                                    {row.status === 'invalid' ? (
                                                        <span className="text-destructive text-xs font-bold" title={row.error}>Error</span>
                                                    ) : (
                                                        <span className="text-green-600 text-xs">OK</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="flex justify-end pt-4">
                            <Button onClick={handleImport} disabled={parsedHoldings.length === 0 || isImporting}>
                                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t.admin.executeImport}
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="cash" className="space-y-4">
                        <div className="grid gap-2">
                            <Label>{t.admin.cashUpdateLabel}</Label>
                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    placeholder={t.admin.cashUpdatePlaceholder}
                                    value={cashAmount}
                                    onChange={(e) => setCashAmount(e.target.value)}
                                />
                                <Button onClick={handleUpdateCash}>{t.admin.update}</Button>
                            </div>
                            <p className="text-xs text-muted-foreground">{t.admin.cashHelper}</p>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
