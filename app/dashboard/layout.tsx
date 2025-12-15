import { NavLinks } from '@/components/dashboard/nav-links'
import { MobileNav } from '@/components/mobile-nav'
import { Camera } from 'lucide-react'

import { SiteFooter } from '@/components/site-footer'
import Link from 'next/link'
import { GlobalPullToRefresh } from '@/components/global-pull-to-refresh'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/dashboard" className="flex items-center">
              <div className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Camera className="h-6 w-6" />
                Snapshot Finance
              </div>
            </Link>
            <div className="hidden sm:block">
              <NavLinks />
            </div>
            <MobileNav type="dashboard" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <GlobalPullToRefresh>
        <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex-1">
          {children}
        </main>
      </GlobalPullToRefresh>

      <SiteFooter />
    </div>
  )
}
