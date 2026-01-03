import { Suspense } from 'react'
import { BigTechNewsClient } from './news-client'
import { NewsHeader } from './news-header'
import { MainNav } from '@/components/main-nav'
import { auth } from '@/lib/auth'
import { SiteFooter } from '@/components/site-footer'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'M7 Daily Brief | Snapshot Finance',
    description: 'AI-powered daily news summaries for Magnificent 7 stocks (Apple, Microsoft, Google, Amazon, Nvidia, Tesla, Meta).',
}

export default async function NewsPage() {
    const session = await auth()

    return (
        <div className="flex min-h-screen flex-col">
            <MainNav user={session?.user} />
            <main className="flex-1 bg-muted/10">
                <div className="container px-4 md:px-6 mx-auto py-8">
                    <NewsHeader />

                    <Suspense fallback={<div className="text-center py-20">Loading news...</div>}>
                        <BigTechNewsClient />
                    </Suspense>
                </div>
            </main>
            <SiteFooter />
        </div>
    )
}
