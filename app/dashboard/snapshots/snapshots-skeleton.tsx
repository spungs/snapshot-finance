// SnapshotsClient와 동일한 레이아웃의 정적 스켈레톤.
// DB 조회 동안 셸 안쪽에서 즉시 렌더된다.
import { SkeletonLoaderBar } from '@/components/ui/skeleton-loader-bar'
import { LoadingHint } from '@/components/ui/loading-hint'

function Bar({ className = '' }: { className?: string }) {
    return <div className={`bg-muted rounded-sm ${className}`} aria-hidden />
}

export function SnapshotsSkeleton() {
    return (
        <>
        <SkeletonLoaderBar />
        <LoadingHint messages={[
            '스냅샷을 불러오는 중...',
            '기록을 정렬하는 중...',
            '타임라인을 준비하는 중...',
            '조금만 더 기다려 주세요',
        ]} />
        <div className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-[420px] md:max-w-2xl mx-auto w-full pb-4 animate-pulse">
            {/* Hero — 페이지 타이틀 */}
            <section className="px-6 pt-3 pb-4 space-y-2">
                <Bar className="h-9 w-32" />
                <Bar className="h-3 w-44" />
            </section>

            {/* Active(latest) snapshot — 큰 카드, 상단 3px 액센트 */}
            <div className="mx-4 mb-4 relative overflow-hidden border bg-card" style={{ padding: 22 }}>
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary/40" />
                <div className="flex items-center justify-between mb-1">
                    <Bar className="h-3 w-16" />
                    <Bar className="h-3 w-20" />
                </div>
                <Bar className="h-6 w-32 mt-2" />
                <Bar className="h-3 w-28 mt-2 mb-[18px]" />
                <Bar className="h-3 w-20 mb-2" />
                <Bar className="h-8 w-48" />

                <div className="flex gap-4 mt-3.5 items-stretch">
                    <div className="space-y-1.5">
                        <Bar className="h-2.5 w-14" />
                        <Bar className="h-4 w-16" />
                    </div>
                    <div className="w-px bg-border self-stretch" />
                    <div className="space-y-1.5">
                        <Bar className="h-2.5 w-12" />
                        <Bar className="h-4 w-20" />
                    </div>
                </div>
            </div>

            {/* Timeline header */}
            <div className="px-6 mb-3">
                <Bar className="h-3 w-28" />
            </div>

            {/* Timeline list with vertical rail + dots */}
            <div className="relative px-6">
                <div
                    aria-hidden
                    className="absolute w-px bg-border"
                    style={{ left: 35, top: 8, bottom: 60 }}
                />
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="flex items-start gap-4 py-3">
                        {/* dot */}
                        <div className="w-[22px] h-[22px] rounded-full flex-shrink-0 mt-1 relative z-10 bg-card border-2 border-border" />
                        {/* card */}
                        <div className="flex-1 min-w-0 border bg-card p-3.5 space-y-2">
                            <div className="flex justify-between items-baseline">
                                <Bar className="h-4 w-24" />
                                <Bar className="h-3 w-12" />
                            </div>
                            <div className="flex justify-between items-baseline gap-2">
                                <Bar className="h-2.5 w-28" />
                                <Bar className="h-3 w-20" />
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-border/60 gap-2">
                                <Bar className="h-3 w-12" />
                                <div className="flex items-center gap-1">
                                    <Bar className="h-4 w-12" />
                                    <Bar className="h-4 w-4" />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        </div>
        </>
    )
}
