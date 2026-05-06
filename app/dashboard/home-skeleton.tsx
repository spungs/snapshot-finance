// HomeClient와 동일한 레이아웃의 정적 스켈레톤.
// 서버 컴포넌트로 즉시 전송되며, KIS API 응답 대기 동안 사용자에게 화면 골격을 보여준다.
import { SkeletonLoaderBar } from '@/components/ui/skeleton-loader-bar'
import { LoadingHint } from '@/components/ui/loading-hint'

function Bar({ className = '' }: { className?: string }) {
    return <div className={`bg-muted rounded-sm ${className}`} aria-hidden />
}

export function HomeSkeleton() {
    return (
        <>
        <SkeletonLoaderBar />
        <LoadingHint stage1="보유 종목 시세를 가져오는 중..." stage2="조금만 더 기다려 주세요" />
        {/* flex-1 + min-h-0 + overflow-hidden — 스켈레톤이 viewport 를 넘겨도 스크롤 안 생김 */}
        <div className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full animate-pulse">
            {/* Hero — 날짜 / 큰 금액 / 수익률 */}
            <section className="px-6 pt-3 pb-6">
                <Bar className="h-3 w-28 mb-3" />
                <Bar className="h-10 sm:h-12 w-56 sm:w-72" />
                <div className="flex gap-2 items-center mt-2.5">
                    <Bar className="h-4 w-16" />
                    <Bar className="h-4 w-24" />
                </div>
            </section>

            {/* Performance chart placeholder */}
            <section className="mx-4 mb-4">
                <Bar className="h-[180px] w-full" />
            </section>

            {/* Two-up — 매입금 / 평가손익금 */}
            <section className="mx-4 mb-2 grid grid-cols-2 gap-2">
                <div className="p-4 bg-card border border-border">
                    <Bar className="h-3 w-14" />
                    <Bar className="h-6 w-24 mt-2" />
                </div>
                <div className="p-4 bg-card border border-border">
                    <Bar className="h-3 w-20" />
                    <Bar className="h-6 w-24 mt-2" />
                </div>
            </section>

            {/* 예수금 단일 행 */}
            <section className="mx-4 mb-4 p-4 bg-card border border-border flex items-center gap-3">
                <Bar className="w-9 h-9 rounded-sm shrink-0" />
                <div className="min-w-0 flex-1">
                    <Bar className="h-3 w-16" />
                </div>
                <Bar className="h-6 w-20 shrink-0" />
            </section>

            {/* Recent snapshot ribbon */}
            <section
                className="mx-4 mb-4 p-[18px] bg-accent-soft border"
                style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}
            >
                <Bar className="h-3 w-24 mb-2" />
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                        <Bar className="h-5 w-28" />
                        <Bar className="h-3 w-32" />
                    </div>
                    <Bar className="h-9 w-20 shrink-0" />
                </div>
            </section>

            {/* TOP returns 리스트 */}
            <section className="px-6 mb-4">
                <Bar className="h-3 w-24 mb-4" />
                <ul className="divide-y divide-border">
                    {[0, 1, 2, 3].map((i) => (
                        <li key={i} className="flex items-center gap-3.5 py-3">
                            <Bar className="h-5 w-4 shrink-0" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <Bar className="h-3.5 w-32" />
                                <Bar className="h-2.5 w-20" />
                            </div>
                            <div className="text-right shrink-0 space-y-1.5">
                                <Bar className="h-3.5 w-20 ml-auto" />
                                <Bar className="h-3 w-14 ml-auto" />
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
        </div>
        </>
    )
}
