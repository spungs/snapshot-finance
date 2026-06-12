import Link from 'next/link'
import { Camera } from 'lucide-react'

// 스냅샷이 없거나 본인 소유가 아닐 때(page.tsx 의 notFound()) 표시.
export default function SnapshotNotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-accent-soft flex items-center justify-center mb-5">
        <Camera className="w-7 h-7 text-primary" strokeWidth={2} />
      </div>
      <h2 className="text-lg font-bold text-foreground tracking-tight">
        스냅샷을 찾을 수 없어요
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-xs leading-relaxed">
        삭제되었거나 접근할 수 없는 스냅샷이에요.
      </p>
      <Link
        href="/dashboard/snapshots"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 transition-all active:scale-[0.97] hover:bg-primary/90"
      >
        스냅샷 목록으로
      </Link>
    </div>
  )
}
