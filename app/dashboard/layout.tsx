import { auth } from '@/lib/auth'
import { ScreenHeader } from '@/components/dashboard/screen-header'
import { BottomTabBar } from '@/components/dashboard/bottom-tab-bar'
import { SWRProvider } from '@/components/swr-provider'
import { User } from 'lucide-react'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // 약관 동의 게이트: 로그인은 됐지만 agreedAt 이 없는 사용자는 동의 화면으로 이동.
  // - 기존 사용자(약관 동의 도입 전 가입)는 마이그레이션 이후 첫 로그인 시 이 경로를 탄다.
  // - signin 페이지의 체크박스를 거친 사용자는 events.signIn 에서 agreedAt 이 자동 세팅된다.
  if (session?.user?.id) {
    const agreedAt = (session.user as { agreedAt?: string | null }).agreedAt
    if (!agreedAt) {
      redirect('/auth/consent')
    }
  }

  const image = session?.user?.image

  return (
    <SWRProvider>
      <div className="min-h-[100dvh] bg-background flex flex-col">
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
          {children}
        </main>

        <BottomTabBar />
      </div>
    </SWRProvider>
  )
}
