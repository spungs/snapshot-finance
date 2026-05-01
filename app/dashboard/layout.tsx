import { auth } from '@/lib/auth'
import { GlobalPullToRefresh } from '@/components/global-pull-to-refresh'
import { ScreenHeader } from '@/components/dashboard/screen-header'
import { BottomTabBar } from '@/components/dashboard/bottom-tab-bar'
import { User } from 'lucide-react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
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

      <GlobalPullToRefresh>
        <main
          className="flex-1 flex flex-col"
          style={{ paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}
        >
          {children}
        </main>
      </GlobalPullToRefresh>

      <BottomTabBar />
    </div>
  )
}
