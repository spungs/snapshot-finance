'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface DonutSegment {
    value: number
    color: string
}

interface DonutChartProps {
    data: DonutSegment[]
    size?: number
    thickness?: number
    selectedIndex?: number | null
    onSegmentSelect?: (index: number | null) => void
}

export function DonutChart({
    data,
    size = 150,
    thickness = 20,
    selectedIndex = null,
    onSegmentSelect,
}: DonutChartProps) {
    // Recharts/SVG path 계산은 부동소수점 결과가 환경에 따라 미세하게 달라질 수 있어
    // SSR과 client hydration 결과가 달라지는 케이스가 있다 (path d attribute mismatch).
    // 도넛은 시각적 보조 요소이므로 client mount 후에만 렌더링해 hydration mismatch를 회피.
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    const radius = (size - thickness) / 2
    const cx = size / 2
    const cy = size / 2
    const total = data.reduce((sum, d) => sum + d.value, 0)

    if (!mounted) {
        return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden />
    }
    if (total === 0) return null

    let acc = 0
    const segments = data.map(d => {
        const fraction = d.value / total
        const a0 = acc * Math.PI * 2 - Math.PI / 2
        acc += fraction
        const a1 = acc * Math.PI * 2 - Math.PI / 2
        const large = fraction > 0.5 ? 1 : 0
        const x0 = cx + radius * Math.cos(a0)
        const y0 = cy + radius * Math.sin(a0)
        const x1 = cx + radius * Math.cos(a1)
        const y1 = cy + radius * Math.sin(a1)
        // Single-segment ring (full circle): use two arcs to draw it
        const path = fraction >= 0.999
            ? `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy}`
            : `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`
        return { path, color: d.color }
    })

    const interactive = !!onSegmentSelect

    const handleSegmentClick = (i: number) => {
        if (!onSegmentSelect) return
        onSegmentSelect(selectedIndex === i ? null : i)
    }

    const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
        // 빈 영역(SVG 자체) 클릭 시 선택 해제
        if (!onSegmentSelect) return
        if (e.target === e.currentTarget) onSegmentSelect(null)
    }

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            onClick={handleSvgClick}
            className={cn(interactive && 'select-none')}
        >
            {segments.map((seg, i) => {
                const dimmed = selectedIndex !== null && selectedIndex !== i
                return (
                    <path
                        key={i}
                        d={seg.path}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={thickness}
                        strokeLinecap="butt"
                        opacity={dimmed ? 0.22 : 1}
                        style={{
                            cursor: interactive ? 'pointer' : 'default',
                            transition: 'opacity 150ms ease-out',
                            pointerEvents: 'stroke',
                        }}
                        onClick={(e) => {
                            e.stopPropagation()
                            handleSegmentClick(i)
                        }}
                    />
                )
            })}
        </svg>
    )
}
