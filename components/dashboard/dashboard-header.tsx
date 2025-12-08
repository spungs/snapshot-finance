'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UserSwitcher } from '@/components/dashboard/user-switcher'
import { useLanguage } from '@/lib/i18n/context'

export function DashboardHeader() {
    const { t } = useLanguage()

    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
            <h1 className="text-xl sm:text-2xl font-bold">{t('dashboard')}</h1>
            <div className="flex gap-2 items-center w-full sm:w-auto">
                <UserSwitcher />
                <Link href="/dashboard/snapshots/new" className="flex-1 sm:flex-none">
                    <Button className="w-full sm:w-auto">{t('newSnapshot')}</Button>
                </Link>
            </div>
        </div>
    )
}
