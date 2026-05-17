// Snapshot Finance 브랜드 로고 — 3D 금괴(자산 시그널).
// 28px 헤더에서도 또렷히 보이도록 각인선 생략하고 본체 3면(상단·정면·우측)만 유지.
// currentColor 로 다크/라이트 테마 자동 적응.

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
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={className}
            aria-hidden
        >
            {/* 상단면 (평행사변형) */}
            <path d="M 28 38 L 38 28 L 80 28 L 70 38 Z" />
            {/* 정면 (사다리꼴) */}
            <path d="M 28 38 L 70 38 L 70 76 L 28 76 Z" />
            {/* 우측면 (평행사변형) */}
            <path d="M 70 38 L 80 28 L 80 66 L 70 76 Z" />
        </svg>
    )
}
