'use client'

import { useLanguage } from '@/lib/i18n/context'
import { PortfolioSummaryCard } from '@/components/dashboard/portfolio-summary-card'
import { HoldingsTable } from '@/components/dashboard/holdings-table'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils/formatters'
import { useRouter } from 'next/navigation'
import { snapshotsApi } from '@/lib/api/client'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { StickyNote } from 'lucide-react'

interface SnapshotDetailClientProps {
    snapshot: any
}

export default function SnapshotDetailClient({ snapshot }: SnapshotDetailClientProps) {
    const { t } = useLanguage()
    const router = useRouter()
    const [isDeleting, setIsDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleDelete() {
        if (!confirm(t('confirmDelete'))) return

        setIsDeleting(true)
        try {
            const res = await snapshotsApi.delete(snapshot.id)
            if (res.success) {
                router.push('/dashboard/snapshots')
            } else {
                setError(res.error?.message || t('deleteFailed'))
                setIsDeleting(false)
            }
        } catch (err) {
            setError(t('networkError'))
            setIsDeleting(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6">
                <div>
                    <Link
                        href="/dashboard/snapshots"
                        className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block"
                    >
                        ← {t('snapshotList')}
                    </Link>
                    <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 flex-wrap">
                        {t('snapshotDetail')}
                        <Badge variant="secondary" className="text-xs sm:text-sm flex items-center gap-1">
                            <StickyNote className="w-3 h-3" />
                            {snapshot.note || t('memoEmpty')}
                        </Badge>
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('snapshotDate')}: <span suppressHydrationWarning>{formatDate(snapshot.snapshotDate)}</span>
                    </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Link href={`/dashboard/snapshots/${snapshot.id}/edit`} className="flex-1 sm:flex-none">
                        <Button variant="outline" className="w-full sm:w-auto">{t('edit')}</Button>
                    </Link>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 sm:flex-none w-full sm:w-auto"
                    >
                        {isDeleting ? t('deleting') : t('deleteSnapshot')}
                    </Button>
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <PortfolioSummaryCard
                totalValue={snapshot.totalValue}
                totalCost={snapshot.totalCost}
                totalProfit={snapshot.totalProfit}
                profitRate={snapshot.profitRate}
                holdingsCount={snapshot.holdings.length}
                exchangeRate={snapshot.exchangeRate}
            />

            <HoldingsTable
                holdings={snapshot.holdings}
                exchangeRate={snapshot.exchangeRate}
                totalValue={Number(snapshot.totalValue)}
            />
        </div>
    )
}
