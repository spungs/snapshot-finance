import { Suspense } from 'react'
import { NewsTabsClient } from './news-tabs-client'
import { NewsHeader } from './news-header'
import { ScreenHeader } from '@/components/dashboard/screen-header'
import { BottomTabBar } from '@/components/dashboard/bottom-tab-bar'
import { auth } from '@/lib/auth'
import { getMyHoldingsForNews } from '@/actions/news'
import { User } from 'lucide-react'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Daily Brief | Snapshot Finance',
    description: 'AI-powered daily news summaries for your holdings and the Magnificent 7 stocks.',
}

export default async function NewsPage() {
    const [session, holdings] = await Promise.all([
        auth(),
        getMyHoldingsForNews(),
    ])

    const image = session?.user?.image

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <ScreenHeader
                right={
                    session?.user ? (
                        image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={image}
                                alt=""
                                aria-hidden
                                className="h-9 w-9 rounded-full object-cover border border-border"
                            />
                        ) : (
                            <div
                                aria-hidden
                                className="h-9 w-9 rounded-full bg-muted flex items-center justify-center border border-border"
                            >
                                <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                        )
                    ) : null
                }
            />

            <main
                className="flex-1 flex flex-col"
                style={{ paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}
            >
                <div className="px-6 py-6 max-w-[480px] md:max-w-2xl mx-auto w-full">
                    <NewsHeader />

                    <Suspense fallback={<div className="text-center py-20 text-muted-foreground">Loading news...</div>}>
                        <NewsTabsClient holdings={holdings} isAuthed={!!session?.user?.id} />
                    </Suspense>
                </div>
            </main>

            <BottomTabBar />
        </div>
    )
}
