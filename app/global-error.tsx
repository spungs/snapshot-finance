'use client'

import { useEffect } from 'react'
import './globals.css'

// 루트 레이아웃까지 무너지는 치명적 에러용 전역 바운더리.
// 이 컴포넌트는 RootLayout 을 대체하므로 자체 <html>/<body> 를 렌더한다.
// ThemeProvider 밖이라 다크 클래스가 없어 라이트 토큰(:root)으로 표시된다.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="ko">
      <body className="font-sans antialiased bg-background text-foreground">
        <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-accent-soft flex items-center justify-center mb-5">
            <span aria-hidden className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold tracking-tight">
            예상치 못한 오류가 발생했어요
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs leading-relaxed">
            잠시 후 다시 시도해 주세요. 문제가 계속되면 페이지를 새로고침해 주세요.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 transition-all active:scale-[0.97] hover:bg-primary/90"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  )
}
