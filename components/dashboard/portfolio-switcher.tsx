'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2, Users } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { setActivePortfolio } from '@/app/actions/portfolio-access-actions'
import { PortfolioSwitchProgress } from '@/components/dashboard/portfolio-switch-progress'

type ManagedPortfolio = { ownerId: string; name: string }

interface PortfolioSwitcherProps {
    /** 로그인한 사람(나)의 표시명 — "내 포트폴리오" 라벨 옆에 사용. */
    selfName?: string | null
    /** 내가 위임받아 관리 가능한 owner 목록. 비어있으면 이 컴포넌트는 렌더되지 않음(layout 가드). */
    managed: ManagedPortfolio[]
    /** 현재 관리 중인 owner id. null 이면 내 포트폴리오. */
    activeOwnerId: string | null
}

export function PortfolioSwitcher({ selfName, managed, activeOwnerId }: PortfolioSwitcherProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const activeLabel = activeOwnerId
        ? managed.find((m) => m.ownerId === activeOwnerId)?.name ?? '관리 중'
        : (selfName || '내 포트폴리오')

    const switchTo = (target: string) => {
        startTransition(async () => {
            await setActivePortfolio(target)
            router.refresh()
        })
    }

    return (
        <>
            {isPending && <PortfolioSwitchProgress />}
            <DropdownMenu>
                <DropdownMenuTrigger
                    disabled={isPending}
                    aria-busy={isPending}
                    className="flex items-center gap-1 rounded-full border border-border px-2.5 h-9 text-sm text-foreground disabled:opacity-60"
                    aria-label="포트폴리오 전환"
                >
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[7rem] truncate">{activeLabel}</span>
                    {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                    <DropdownMenuLabel>포트폴리오 선택</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => switchTo('self')} className="justify-between">
                        <span className="truncate">{selfName || '내 포트폴리오'}</span>
                        {activeOwnerId === null && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                    {managed.map((m) => (
                        <DropdownMenuItem
                            key={m.ownerId}
                            onClick={() => switchTo(m.ownerId)}
                            className="justify-between"
                        >
                            <span className="truncate">{m.name}</span>
                            {activeOwnerId === m.ownerId && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    )
}
