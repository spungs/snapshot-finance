'use client'

import { useId } from 'react'

interface SparklineProps {
    data: number[]
    width?: number
    height?: number
    color?: string
    fillColor?: string
    showZeroAxis?: boolean
}

export function Sparkline({
    data,
    width = 320,
    height = 100,
    color = 'currentColor',
    fillColor,
    showZeroAxis = false,
}: SparklineProps) {
    // useId는 서버/클라이언트에서 동일한 값을 보장 — Math.random() 사용 시 hydration mismatch 발생
    const reactId = useId()
    if (!data.length) return null

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const stepX = data.length > 1 ? width / (data.length - 1) : 0

    const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * height])
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`

    const zeroY = max > 0 && min < 0 ? height - ((0 - min) / range) * height : null
    const gradId = `spark-grad-${reactId.replace(/:/g, '')}`

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="block w-full h-auto overflow-visible"
        >
            {fillColor && (
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={fillColor} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
                    </linearGradient>
                </defs>
            )}
            {fillColor && <path d={areaPath} fill={`url(#${gradId})`} />}
            {showZeroAxis && zeroY !== null && (
                <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(127,127,127,0.25)" strokeDasharray="2 3" />
            )}
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    )
}
