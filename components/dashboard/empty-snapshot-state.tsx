'use client'

import Link from 'next/link'
import { Camera, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'

export function EmptySnapshotState() {
    const { t } = useLanguage()

    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
                <Camera className="w-8 h-8 text-primary" />
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2">
                {t('noSnapshots')}
            </h3>

            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8 whitespace-pre-line">
                {t('noSnapshotsDesc')}
            </p>

            <Link href="/dashboard/snapshots/new">
                <Button size="lg" className="gap-2">
                    <PlusCircle className="w-4 h-4" />
                    {t('createFirstSnapshot')}
                </Button>
            </Link>
        </div>
    )
}
