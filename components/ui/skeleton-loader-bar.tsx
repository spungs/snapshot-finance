// Skeleton 상단에 배치하는 얇은 indeterminate progress bar.
// 1.5초 주기로 좌→우 sweep 하므로 사용자가 "정지된 화면이 아니라 진행 중"임을
// 가늠할 수 있다. Skeleton 이 사라지면 함께 unmount 되므로 별도의 navigation
// event 처리는 필요 없다.

export function SkeletonLoaderBar() {
    return (
        <div className="h-[2px] w-full overflow-hidden bg-secondary/40" aria-hidden>
            <div className="h-full bg-primary animate-indeterminate" />
        </div>
    )
}
