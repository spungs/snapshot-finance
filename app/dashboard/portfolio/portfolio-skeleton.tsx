// PortfolioClient와 동일한 레이아웃의 정적 스켈레톤.
// KIS API를 포함한 데이터 페칭 동안 셸 안쪽에서 즉시 렌더된다.
import { SkeletonLoaderBar } from '@/components/ui/skeleton-loader-bar'

function Bar({ className = '' }: { className?: string }) {
    return <div className={`bg-muted rounded-sm ${className}`} aria-hidden />
}

export function PortfolioSkeleton() {
    return (
        <>
        <SkeletonLoaderBar />
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full animate-pulse">
            {/* Hero — 페이지 타이틀 + 공유 버튼 자리 */}
            <section className="px-6 pt-3 pb-4 flex items-end justify-between gap-3">
                <Bar className="h-9 w-44" />
                <Bar className="h-8 w-16 shrink-0" />
            </section>

            {/* Donut + legend */}
            <section className="mx-4 mb-4 p-5 bg-card border border-border">
                <div className="flex items-center gap-4">
                    <div className="shrink-0">
                        <Bar className="h-[130px] w-[130px] rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                        <Bar className="h-2.5 w-20" />
                        <Bar className="h-6 w-32" />
                        <Bar className="h-3 w-24" />
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="flex items-center gap-2 py-0.5">
                            <Bar className="w-2 h-2 shrink-0" />
                            <Bar className="h-3 w-16 flex-1" />
                            <Bar className="h-3 w-10" />
                        </div>
                    ))}
                </div>
            </section>

            {/* 예수금 단일 행 */}
            <section className="mx-4 mb-4 p-4 bg-card border border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Bar className="w-9 h-9 rounded-sm shrink-0" />
                    <div className="min-w-0 space-y-1.5">
                        <Bar className="h-2.5 w-16" />
                        <Bar className="h-5 w-24" />
                    </div>
                </div>
                <Bar className="h-8 w-12 shrink-0" />
            </section>

            {/* Holdings header — count + sort */}
            <div className="px-6 pb-3 flex justify-between items-center gap-2">
                <Bar className="h-3 w-24" />
                <div className="flex items-center gap-2">
                    <Bar className="h-3 w-10" />
                    <Bar className="h-3 w-10" />
                    <Bar className="h-3 w-10" />
                </div>
            </div>

            {/* Holdings list — 4행 */}
            <div className="px-4 pb-4 space-y-1.5">
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        className="bg-card border border-border p-4"
                        style={{ borderLeftWidth: '3px', borderLeftColor: 'var(--border)' }}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <Bar className="h-4 w-32 flex-1" />
                            <Bar className="h-4 w-4 shrink-0" />
                        </div>
                        <div className="mt-1.5 flex items-end justify-between gap-3">
                            <div className="flex-1 min-w-0 space-y-1">
                                <Bar className="h-2.5 w-40" />
                                <Bar className="h-2.5 w-20" />
                            </div>
                            <div className="text-right shrink-0 space-y-1">
                                <Bar className="h-2.5 w-20 ml-auto" />
                                <Bar className="h-3.5 w-24 ml-auto" />
                                <Bar className="h-3 w-16 ml-auto" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        </>
    )
}
