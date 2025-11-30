'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UserSwitcher } from '@/components/dashboard/user-switcher'
import { useLanguage } from '@/lib/i18n/context'

export function DashboardHeader() {
    const { t } = useLanguage()

    return (
        <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">{t('dashboard')}</h1>
            <div className="flex gap-2 items-center">
                <UserSwitcher />
                <Link href="/dashboard/snapshots/new">
                    <Button>{t('newSnapshot')}</Button>
                </Link>
            </div>
        </div>
    )
}
