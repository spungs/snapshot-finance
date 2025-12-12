import Link from 'next/link'
import { NavLinks } from '@/components/dashboard/nav-links'
import { MobileNav } from '@/components/mobile-nav'
import { Camera } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/dashboard" className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Camera className="h-6 w-6" />
              Snapshot Finance
            </Link>
            <div className="hidden sm:block">
              <NavLinks />
            </div>
            <MobileNav type="dashboard" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {children}
      </main>
    </div>
  )
}
