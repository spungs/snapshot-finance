import Link from 'next/link'
import { Camera } from 'lucide-react'

interface ScreenHeaderProps {
    right?: React.ReactNode
}

export function ScreenHeader({ right }: ScreenHeaderProps) {
    return (
        <header className="px-6 pt-3.5 pb-2 flex items-center justify-between max-w-[420px] mx-auto sm:max-w-[640px]">
            <Link href="/dashboard" className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" strokeWidth={2} aria-hidden />
                <span className="text-base font-bold text-foreground tracking-tight">
                    Snapshot
                </span>
            </Link>
            {right && <div className="flex items-center gap-3">{right}</div>}
        </header>
    )
}
