// SnapshotDetailClient와 동일한 레이아웃의 정적 스켈레톤.
// DB 조회 동안 셸 안쪽에서 즉시 렌더된다.
import { SkeletonLoaderBar } from '@/components/ui/skeleton-loader-bar'
import { LoadingHint } from '@/components/ui/loading-hint'

function Bar({ className = '' }: { className?: string }) {
    return <div className={`bg-muted rounded-sm ${className}`} aria-hidden />
}

export function SnapshotDetailSkeleton() {
    return (
        <>
        <SkeletonLoaderBar />
        <LoadingHint stage1="스냅샷 상세를 불러오는 중..." stage2="조금만 더 기다려 주세요" />
        <div className="max-w-[420px] md:max-w-2xl mx-auto w-full pb-8 animate-pulse">
            {/* Hero — back link + title + 더보기 */}
            <section className="px-6 pt-3 pb-4">
                <Bar className="h-3 w-20 mb-2" />
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                        <Bar className="h-9 w-44" />
                        <Bar className="h-3 w-28" />
                    </div>
                    <Bar className="h-4 w-4 shrink-0 mt-3" />
                </div>
            </section>

            {/* Summary card — 상단 3px 액센트 */}
            <div className="mx-4 mb-2 relative overflow-hidden border bg-card" style={{ padding: 22 }}>
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary/40" />
                <div className="flex items-center justify-between mb-1">
                    <Bar className="h-3 w-20" />
                    <Bar className="h-3 w-24" />
                </div>
                <Bar className="h-6 w-32 mt-2" />
                <Bar className="h-3 w-20 mt-3.5 mb-2" />
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

            {/* Two-up: stock value / cash */}
            <section className="mx-4 mb-4 grid grid-cols-2 gap-2">
                <div className="p-4 bg-card border border-border space-y-1.5">
                    <Bar className="h-2.5 w-16" />
                    <Bar className="h-5 w-24" />
                    <div className="pt-2 mt-2 border-t border-border/60 flex justify-between">
                        <Bar className="h-2.5 w-12" />
                        <Bar className="h-2.5 w-16" />
                    </div>
                </div>
                <div className="p-4 bg-card border border-border space-y-1.5">
                    <Bar className="h-2.5 w-12" />
                    <Bar className="h-5 w-24" />
                </div>
            </section>

            {/* Holdings header */}
            <div className="px-6 pb-3 flex justify-between items-center">
                <Bar className="h-3 w-24" />
                <Bar className="h-2.5 w-16" />
            </div>

            {/* Holdings list — 4행 */}
            <div className="px-4 space-y-1.5">
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        className="bg-card border border-border p-4"
                        style={{ borderLeftWidth: '3px', borderLeftColor: 'var(--border)' }}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <Bar className="h-4 w-32 flex-1" />
                            <Bar className="h-3 w-12 shrink-0" />
                        </div>
                        <div className="mt-1.5 flex items-end justify-between gap-3">
                            <Bar className="h-2.5 w-44 flex-1" />
                            <Bar className="h-3.5 w-20 shrink-0" />
                        </div>
                        <div className="mt-2.5 pt-2.5 border-t border-border/60 grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Bar className="h-2.5 w-12" />
                                <Bar className="h-3 w-16" />
                            </div>
                            <div className="space-y-1 text-right">
                                <Bar className="h-2.5 w-12 ml-auto" />
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
