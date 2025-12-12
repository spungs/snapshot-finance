'use client'

import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'

interface DashboardHeaderProps {
    cashBalance?: number
    onRefresh?: () => void
    isRefreshing?: boolean
}

export function DashboardHeader({ cashBalance = 0, onRefresh, isRefreshing = false }: DashboardHeaderProps) {
    const { t } = useLanguage()

    return (
        <div className="space-y-1">
            <div className="flex flex-row justify-between items-center">
                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                    {t('dashboard')}
                </h1>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="gap-2"
                >
                    <RotateCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                    {t('refresh') || 'Refresh'}
                </Button>
            </div>
        </div>
    )
}
