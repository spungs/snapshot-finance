'use client'

import { useRouter } from 'next/navigation'
import { PullToRefresh } from '@/components/ui/pull-to-refresh'
import { ReactNode } from 'react'

export function GlobalPullToRefresh({ children }: { children: ReactNode }) {
    const router = useRouter()

    const handleRefresh = async () => {
        router.refresh()
        // wait a bit to simulate network delay if router.refresh is too fast, 
        // or just return. router.refresh returns void but triggers a re-fetch.
        // We can wait a small amount of time to ensure the spinner is visible.
        await new Promise(resolve => setTimeout(resolve, 500))
    }

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            {children}
        </PullToRefresh>
    )
}
