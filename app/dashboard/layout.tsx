import { auth } from '@/lib/auth'
import { GlobalPullToRefresh } from '@/components/global-pull-to-refresh'
import { ScreenHeader } from '@/components/dashboard/screen-header'
import { BottomTabBar } from '@/components/dashboard/bottom-tab-bar'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { UserAccountNav } from '@/components/dashboard/user-account-nav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ScreenHeader
        right={
          <>
            <ThemeToggle />
            {session?.user && <UserAccountNav user={session.user} />}
          </>
        }
      />

      <GlobalPullToRefresh>
        <main className="flex-1 flex flex-col pb-24">
          {children}
        </main>
      </GlobalPullToRefresh>

      <BottomTabBar />
    </div>
  )
}
