'use client'

import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { PortfolioSummaryCard } from '@/components/dashboard/portfolio-summary-card'
import { HoldingsTable } from '@/components/dashboard/holdings-table'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils/formatters'
import { useRouter } from 'next/navigation'
import { snapshotsApi } from '@/lib/api/client'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SnapshotDetailClientProps {
    snapshot: any
}

export default function SnapshotDetailClient({ snapshot }: SnapshotDetailClientProps) {
    const { t } = useLanguage()
    const { baseCurrency, exchangeRate } = useCurrency()
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
            <div className="flex justify-between items-center">
                <div>
                    <Link
                        href="/dashboard/snapshots"
                        className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
                    >
                        ← {t('snapshotList')}
                    </Link>
                    <h1 className="text-2xl font-bold">
                        {t('snapshotDetail')} - {formatDate(snapshot.snapshotDate)}
                    </h1>
                </div>
                <div className="flex gap-2">
                    <Link href={`/dashboard/snapshots/${snapshot.id}/edit`}>
                        <Button variant="outline">{t('edit')}</Button>
                    </Link>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isDeleting}
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
                cashBalance={snapshot.cashBalance}
                holdingsCount={snapshot.holdings.length}
                baseCurrency={baseCurrency}
                exchangeRate={exchangeRate}
            />

            <HoldingsTable holdings={snapshot.holdings} />
        </div>
    )
}
