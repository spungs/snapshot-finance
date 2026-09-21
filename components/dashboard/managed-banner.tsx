'use client'

import { UserCog } from 'lucide-react'
import { PortfolioSwitchProgress } from '@/components/dashboard/portfolio-switch-progress'
import { usePortfolioSwitch } from '@/lib/hooks/use-portfolio-switch'

interface ManagedBannerProps {
    ownerName: string
}

/**
 * 다른 사람 포트폴리오를 관리 중일 때 상시 노출되는 배너.
 * "내 것처럼 보이는데 사실 남의 것" 혼동을 막는 안전장치 — 눈에 띄는 색조 + 복귀 버튼.
 */
export function ManagedBanner({ ownerName }: ManagedBannerProps) {
    // 드롭다운과 같은 훅을 쓴다. 과거엔 이 버튼만 구버전 경로로 남아 있어,
    // 여기로 복귀하면 SWR 캐시가 비워지지 않아 성과 흐름 그래프만 이전 사람 데이터로 남았다.
    const { switchTo, isPending } = usePortfolioSwitch()
    const backToSelf = () => switchTo('self')

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
