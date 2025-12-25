import { Metadata } from 'next'
import { WhatIfClient } from './what-if-client'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
    title: '만약에 (What If) | Snapshot Finance',
    description: '과거 이 시점에 샀더라면? 주가 히스토리 시뮬레이션',
}

export default async function WhatIfPage() {
    const session = await auth()

    if (!session) {
        redirect('/')
    }

    return <WhatIfClient />
}
