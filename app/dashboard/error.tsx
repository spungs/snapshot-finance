'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// 대시보드 세그먼트 에러 바운더리 — 서버 컴포넌트/데이터 조회가 throw 하면
// Next 기본 에러 화면 대신 이 화면이 표시된다.
export default function DashboardError({
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
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-accent-soft flex items-center justify-center mb-5">
        <AlertCircle className="w-7 h-7 text-primary" strokeWidth={2} />
      </div>
      <h2 className="text-lg font-bold text-foreground tracking-tight">
        일시적인 문제가 발생했어요
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-xs leading-relaxed">
        잠시 후 다시 시도해 주세요. 계속되면 새로고침하거나 홈으로 이동해 주세요.
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>
          <RotateCw className="w-4 h-4" />
          다시 시도
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">홈으로</Link>
        </Button>
      </div>
    </div>
  )
}
