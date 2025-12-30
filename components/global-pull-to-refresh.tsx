'use client'

import { useRouter } from 'next/navigation'
import { PullToRefresh } from '@/components/ui/pull-to-refresh'
import { ReactNode, useTransition } from 'react'

export function GlobalPullToRefresh({ children }: { children: ReactNode }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleRefresh = async () => {
        // Wrap router.refresh() in a transition to track its pending state
        startTransition(() => {
            router.refresh()
        })
    }

    return (
        <PullToRefresh onRefresh={handleRefresh} isRefreshing={isPending} className="flex-1 flex flex-col">
            {children}
        </PullToRefresh>
    )
}
