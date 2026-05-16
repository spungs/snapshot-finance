// Snapshot Finance 브랜드 로고 — 카메라 바디 + 4개의 캔들스틱(상승 패턴).
// 28px 헤더에서도 깔끔히 보이도록 wick 제거 + body 두껍게 + stroke 강화.
// currentColor 로 테마 자동 적응(다크/라이트).

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
            {/* 카메라 바디 — 상단 뷰파인더 돌출 + 우측 셔터 dot */}
            <path d="M 4 8 h 4 l 1.2 -2 h 5.6 l 1.2 2 h 4 a 2 2 0 0 1 2 2 v 9 a 2 2 0 0 1 -2 2 h -16 a 2 2 0 0 1 -2 -2 v -9 a 2 2 0 0 1 2 -2 z" />
            <circle cx="19" cy="10.5" r="0.6" fill="currentColor" stroke="none" />

            {/* 캔들스틱 4개 — body 만, 좌→우 점진 상승. wick 제거로 작은 사이즈에서도 또렷. */}
            <rect x="5.25" y="14" width="1.5" height="3" rx="0.2" fill="currentColor" stroke="none" />
            <rect x="8.75" y="12.5" width="1.5" height="4.5" rx="0.2" fill="currentColor" stroke="none" />
            <rect x="12.25" y="11" width="1.5" height="6" rx="0.2" fill="currentColor" stroke="none" />
            <rect x="15.75" y="9.5" width="1.5" height="7.5" rx="0.2" fill="currentColor" stroke="none" />
        </svg>
    )
}
