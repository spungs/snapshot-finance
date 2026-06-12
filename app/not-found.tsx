import Link from 'next/link'

// 전역 404 — 존재하지 않는 경로 접근 시 표시.
export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-background">
      <div className="text-5xl font-extrabold tracking-tight text-foreground numeric">404</div>
      <h2 className="mt-3 text-lg font-bold text-foreground tracking-tight">
        페이지를 찾을 수 없어요
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-xs leading-relaxed">
        주소가 바뀌었거나 삭제된 페이지일 수 있어요.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 transition-all active:scale-[0.97] hover:bg-primary/90"
      >
        홈으로 가기
      </Link>
    </div>
  )
}
