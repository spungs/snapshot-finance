'use client'

interface DonutSegment {
    value: number
    color: string
}

interface DonutChartProps {
    data: DonutSegment[]
    size?: number
    thickness?: number
}

export function DonutChart({ data, size = 150, thickness = 20 }: DonutChartProps) {
    const radius = (size - thickness) / 2
    const cx = size / 2
    const cy = size / 2
    const total = data.reduce((sum, d) => sum + d.value, 0)

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

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segments.map((seg, i) => (
                <path
                    key={i}
                    d={seg.path}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={thickness}
                    strokeLinecap="butt"
                />
            ))}
        </svg>
    )
}
