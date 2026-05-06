// 페이지별 specific skeleton 이 없는 라우트의 공용 fallback.
// 어떤 페이지에 와도 어색하지 않을 보편적 모양 (제목 + 카드 스택)으로 두고,
// 상단 SkeletonLoaderBar 가 시간 흐름을 시각화한다.

import { SkeletonLoaderBar } from './skeleton-loader-bar'

function Bar({ className = '' }: { className?: string }) {
    return <div className={`bg-muted rounded-sm ${className}`} aria-hidden />
}

export function GenericPageSkeleton() {
    return (
        <>
            <SkeletonLoaderBar />
            <div className="max-w-[480px] md:max-w-2xl mx-auto w-full animate-pulse">
                {/* Title hero */}
                <section className="px-6 pt-3 pb-4 space-y-2">
                    <Bar className="h-9 w-44" />
                    <Bar className="h-3 w-56" />
                </section>

                {/* Body cards */}
                <section className="mx-4 space-y-2">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="bg-card border border-border p-4 space-y-2">
                            <Bar className="h-3 w-24" />
                            <Bar className="h-5 w-44" />
                            <Bar className="h-3 w-32" />
                        </div>
                    ))}
                </section>
            </div>
        </>
    )
}
