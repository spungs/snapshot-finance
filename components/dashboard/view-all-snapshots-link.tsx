'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'

export function ViewAllSnapshotsLink() {
    const { t } = useLanguage()

    return (
        <div className="text-center">
            <Link href="/dashboard/snapshots">
                <Button variant="outline">{t('viewAllSnapshots')}</Button>
            </Link>
        </div>
    )
}
