import Link from 'next/link'
import { Camera } from 'lucide-react'

interface ScreenHeaderProps {
    right?: React.ReactNode
}

// 헤더 sticky + backdrop-blur가 모바일에서 페이지 자체 스크롤을 차단하는 케이스가
// 발견돼 정적 헤더로 되돌렸다. P2-3(헤더 sticky)는 다른 방식으로 재시도 필요.
export function ScreenHeader({ right }: ScreenHeaderProps) {
    return (
        <header
            className="border-b border-border/50"
            style={{ paddingTop: 'calc(0.875rem + var(--safe-top, 0px))' }}
        >
            <div className="px-6 pb-2 flex items-center justify-between max-w-[420px] mx-auto sm:max-w-[640px]">
                <Link href="/dashboard" className="flex items-center gap-2 min-h-[44px]">
                    <Camera className="w-5 h-5 text-primary" strokeWidth={2} aria-hidden />
                    <span className="text-base font-bold text-foreground tracking-tight">
                        Snapshot
                    </span>
                </Link>
                {right && <div className="flex items-center gap-1">{right}</div>}
            </div>
        </header>
    )
}
