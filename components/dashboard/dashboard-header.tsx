'use client'


import { useLanguage } from '@/lib/i18n/context'

export function DashboardHeader() {
    const { t } = useLanguage()

    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
            <h1 className="text-xl sm:text-2xl font-bold">{t('dashboard')}</h1>
        </div>
    )
}
