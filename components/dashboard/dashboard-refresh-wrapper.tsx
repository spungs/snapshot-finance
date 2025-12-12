'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'

interface DashboardRefreshWrapperProps {
    cashBalance?: number
    children: React.ReactNode
}

export function DashboardRefreshWrapper({ cashBalance, children }: DashboardRefreshWrapperProps) {
    const { t } = useLanguage()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleRefresh = () => {
        startTransition(() => {
            router.refresh()
        })
    }

    return (
        <div className="space-y-6">
            <DashboardHeader
                cashBalance={cashBalance}
                onRefresh={handleRefresh}
                isRefreshing={isPending}
            />

            <div className="relative">
                {isPending && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-start pt-20 justify-center rounded-lg">
                        <div className="sticky top-20 flex flex-col items-center gap-3">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                            <p className="text-sm font-medium text-gray-600 animate-pulse">{t('refreshing')}</p>
                        </div>
                    </div>
                )}
                {children}
            </div>
        </div>
    )
}
