// Snapshot Finance 브랜드 로고 — 카메라 바디 + 지그재그 주가 라인(상승 추세) + 끝점 dot.
// 28px 헤더에서도 또렷히 "주식 차트"로 인지되도록 단조 막대(신호 막대 오인)를 라인 차트로 교체.
// 라인 끝점 dot 이 셔터 버튼 역할도 겸함. currentColor 로 테마 자동 적응.

interface SnapshotLogoProps {
    className?: string
    size?: number
}

export function SnapshotLogo({ className, size = 24 }: SnapshotLogoProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden
        >
            {/* 카메라 바디 — 상단 뷰파인더 돌출 */}
            <path d="M 4 8 h 4 l 1.2 -2 h 5.6 l 1.2 2 h 4 a 2 2 0 0 1 2 2 v 9 a 2 2 0 0 1 -2 2 h -16 a 2 2 0 0 1 -2 -2 v -9 a 2 2 0 0 1 2 -2 z" />

            {/* 주가 라인 — 좌하단에서 출발해 변동하며 우상단으로 상승 */}
            <path d="M 5.5 17.5 L 8 14.5 L 10.5 16 L 13 12.5 L 15.5 14 L 18.5 10" strokeWidth="1.6" />

            {/* 라인 끝점 dot — 셔터 버튼 겸 최고가 표시 */}
            <circle cx="18.5" cy="10" r="1" fill="currentColor" stroke="none" />
        </svg>
    )
}
