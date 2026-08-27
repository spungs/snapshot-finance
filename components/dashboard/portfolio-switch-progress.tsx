import { SkeletonLoaderBar } from '@/components/ui/skeleton-loader-bar'

// 포트폴리오 전환 중 화면 최상단에 뜨는 진행 표시.
// 전환은 서버 컴포넌트 재렌더(router.refresh)라 스켈레톤이 뜨지 않고 기존 화면이 그대로
// 남으므로, 진행 중임을 알리는 신호가 따로 필요하다.
// 헤더가 static 이라 fixed 는 뷰포트 기준으로 걸린다. iOS 노치에 가리지 않도록 safe-top 만큼 내림.
export function PortfolioSwitchProgress() {
    return (
        <div
            className="fixed inset-x-0 z-[60]"
            style={{ top: 'var(--safe-top, 0px)' }}
            aria-hidden
        >
            <SkeletonLoaderBar />
        </div>
    )
}
