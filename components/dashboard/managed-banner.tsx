'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCog } from 'lucide-react'
import { setActivePortfolio } from '@/app/actions/portfolio-access-actions'
import { PortfolioSwitchProgress } from '@/components/dashboard/portfolio-switch-progress'

interface ManagedBannerProps {
    ownerName: string
}

/**
 * 다른 사람 포트폴리오를 관리 중일 때 상시 노출되는 배너.
 * "내 것처럼 보이는데 사실 남의 것" 혼동을 막는 안전장치 — 눈에 띄는 색조 + 복귀 버튼.
 */
export function ManagedBanner({ ownerName }: ManagedBannerProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const backToSelf = () => {
        startTransition(async () => {
            await setActivePortfolio('self')
            router.refresh()
        })
    }

    return (
        <>
            {isPending && <PortfolioSwitchProgress />}
            <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200">
                <div className="px-6 py-2 flex items-center justify-between gap-3 max-w-[480px] md:max-w-2xl mx-auto text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                        <UserCog className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                            <b className="font-semibold">{ownerName}</b>님의 포트폴리오를 관리 중
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={backToSelf}
                        disabled={isPending}
                        className="shrink-0 underline underline-offset-2 disabled:opacity-60"
                    >
                        내 포트폴리오로 →
                    </button>
                </div>
            </div>
        </>
    )
}
