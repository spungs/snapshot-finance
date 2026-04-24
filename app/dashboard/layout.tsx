import { MainNav } from '@/components/main-nav'
import { auth } from '@/lib/auth'

import { SiteFooter } from '@/components/site-footer'
import Link from 'next/link'
import { GlobalPullToRefresh } from '@/components/global-pull-to-refresh'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <MainNav user={session?.user} />

      {/* Main Content */}
      <GlobalPullToRefresh>
        <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex-1 flex flex-col">
          {children}
        </main>
      </GlobalPullToRefresh>

      <SiteFooter />
    </div>
  )
}
