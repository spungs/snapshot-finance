'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'

export function EmptySnapshotState() {
    const { t } = useLanguage()

    return (
        <div className="text-center py-12 bg-white rounded-lg border">
            <p className="text-gray-500 mb-4">{t('noSnapshots')}</p>
            <Link href="/dashboard/snapshots/new">
                <Button>{t('createFirstSnapshot')}</Button>
            </Link>
        </div>
    )
}
