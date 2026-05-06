// Snapshot Finance 브랜드 로고 — 카메라 바디 + 렌즈 안에 3개의 캔들스틱.
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
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden
        >
            {/* Camera body — 좌상단에 뷰파인더 돌출 + 좌측 작은 dot */}
            <path d="M14.5 4.5h-5L7 7H4a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
            {/* 우상단 셔터 dot */}
            <circle cx="18.5" cy="5.5" r="0.4" fill="currentColor" stroke="none" />
            {/* 렌즈 */}
            <circle cx="12" cy="13" r="3.6" />
            {/* 캔들스틱 3개 — 좌·중·우, 가운데가 가장 김. wick(thin line) + body(filled rect) */}
            {/* 좌 (짧음) */}
            <line x1="10.2" y1="11.6" x2="10.2" y2="14.4" strokeWidth="0.6" />
            <rect x="9.85" y="12.1" width="0.7" height="1.8" fill="currentColor" stroke="none" />
            {/* 중 (가장 김) */}
            <line x1="12" y1="10.5" x2="12" y2="15.5" strokeWidth="0.6" />
            <rect x="11.65" y="11.2" width="0.7" height="2.6" fill="currentColor" stroke="none" />
            {/* 우 (중간) */}
            <line x1="13.8" y1="11.2" x2="13.8" y2="14.8" strokeWidth="0.6" />
            <rect x="13.45" y="11.8" width="0.7" height="2.2" fill="currentColor" stroke="none" />
        </svg>
    )
}
