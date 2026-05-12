// Snapshot Finance 브랜드 로고 — 카메라 바디 + 4개의 캔들스틱 + 우상향 화살표.
// 인라인 SVG 라 어떤 사이즈에서도 sharp, currentColor 로 테마 자동 적응
// (다크/라이트), 패딩 없음 → 헤더 wordmark 와의 spacing 자연스러움.

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
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden
        >
            {/* 카메라 바디 — 상단 뷰파인더 돌출 + 우측 셔터 dot */}
            <path d="M 4 8 h 4 l 1.2 -2 h 5.6 l 1.2 2 h 4 a 2 2 0 0 1 2 2 v 9 a 2 2 0 0 1 -2 2 h -16 a 2 2 0 0 1 -2 -2 v -9 a 2 2 0 0 1 2 -2 z" />
            <circle cx="19" cy="9.5" r="0.4" fill="currentColor" stroke="none" />

            {/* 캔들스틱 4개 — 좌→우 점진 상승 (wick + body) */}
            <line x1="6" y1="13.5" x2="6" y2="17" strokeWidth="0.6" />
            <rect x="5.5" y="14" width="1" height="2.5" fill="currentColor" stroke="none" />

            <line x1="9.5" y1="12" x2="9.5" y2="17" strokeWidth="0.6" />
            <rect x="9" y="12.5" width="1" height="4" fill="currentColor" stroke="none" />

            <line x1="13" y1="10.5" x2="13" y2="17" strokeWidth="0.6" />
            <rect x="12.5" y="11" width="1" height="5" fill="currentColor" stroke="none" />

            <line x1="16.5" y1="9.5" x2="16.5" y2="17" strokeWidth="0.6" />
            <rect x="16" y="10" width="1" height="6" fill="currentColor" stroke="none" />

            {/* 우상향 추세선 — 캔들 정점들을 가로지른 후 우상단 화살촉 */}
            <path d="M 6 13 L 9.5 11.5 L 13 10 L 18 9" strokeWidth="1.2" />
            <path d="M 16 8.5 L 18 9 L 17.5 11" strokeWidth="1.2" />
        </svg>
    )
}
