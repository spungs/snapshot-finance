'use client'


import { useLanguage } from '@/lib/i18n/context'

interface DashboardHeaderProps {
    cashBalance?: number
}

export function DashboardHeader({ cashBalance = 0 }: DashboardHeaderProps) {
    const { t } = useLanguage()

    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                {t('dashboard')}
            </h1>
        </div>
    )
}
