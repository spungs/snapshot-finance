'use client'

import React, { useState, useRef, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PullToRefreshProps {
    children: ReactNode
    onRefresh: () => Promise<void>
    className?: string
    isRefreshing?: boolean
}

export function PullToRefresh({ children, onRefresh, className, isRefreshing: externalRefreshing }: PullToRefreshProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [internalRefreshing, setInternalRefreshing] = useState(false)
    const [currentY, setCurrentY] = useState(0)

    // Determine effective refreshing state
    const refreshing = externalRefreshing !== undefined ? externalRefreshing : internalRefreshing

    // Use refs for gesture state to avoid stale closures in event listeners
    const stateRef = useRef({
        startY: 0,
        isPulling: false,
        currentY: 0,
        directionDecided: false,
    })

    const threshold = 80

    // Effect to handle external refreshing state changes (specifically completion)
    useEffect(() => {
        if (!refreshing && stateRef.current.currentY > 0) {
            // Reset to 0 when refreshing finishes
            setCurrentY(0)
            stateRef.current.currentY = 0
        }
    }, [refreshing])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleTouchStart = (e: TouchEvent) => {
            // 시작 지점만 기록한다. isPulling은 touchmove에서 첫 의미있는 움직임의 방향이
            // 결정된 다음에야 true로 잡는다 — 이전 구현은 touchstart에서 즉시 isPulling=true로
            // 잡아 위로 스와이프(아래에서 위) 시 native scroll이 모바일에서 첫 frame 동안
            // 의도치 않게 차단되는 케이스가 있었다.
            stateRef.current.startY = e.touches[0].clientY
            stateRef.current.isPulling = false
            stateRef.current.directionDecided = false
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (refreshing) return

            const y = e.touches[0].clientY
            const diff = y - stateRef.current.startY

            if (!stateRef.current.directionDecided) {
                // 의미있는 움직임이 감지되기 전까진 결정을 미룸 (작은 흔들림 무시)
                if (Math.abs(diff) < 5) return

                // 페이지 최상단에서 아래로 당기는 경우만 풀투리프레시 발동.
                // 그 외(위로 스와이프 = 콘텐츠 보기 위한 일반 스크롤)는 native scroll에 양보.
                if (diff > 0 && window.scrollY <= 0) {
                    stateRef.current.isPulling = true
                } else {
                    stateRef.current.isPulling = false
                }
                stateRef.current.directionDecided = true
            }

            if (!stateRef.current.isPulling) return

            if (diff > 0 && window.scrollY <= 0) {
                if (e.cancelable) {
                    e.preventDefault() // Key to preventing native scroll/overscroll
                }

                // Add resistance
                const damped = Math.min(diff * 0.5, threshold * 1.5)
                stateRef.current.currentY = damped
                setCurrentY(damped)
            } else {
                // 사용자가 다시 위로 끌어올린 경우 풀 종료
                stateRef.current.isPulling = false
                setCurrentY(0)
            }
        }

        const handleTouchEnd = async () => {
            if (!stateRef.current.isPulling || refreshing) return

            stateRef.current.isPulling = false
            const finalY = stateRef.current.currentY

            if (finalY >= threshold) {
                // If external control is used, don't set internal state unless necessary?
                // Actually we just call onRefresh.
                if (externalRefreshing === undefined) {
                    setInternalRefreshing(true)
                }

                setCurrentY(threshold - 10) // Snap to loading

                try {
                    await onRefresh()
                } finally {
                    // Only manage state if internal
                    if (externalRefreshing === undefined) {
                        setInternalRefreshing(false)
                        setCurrentY(0)
                        stateRef.current.currentY = 0
                    }
                    // If external, we let the prop change trigger the reset effect
                }
            } else {
                setCurrentY(0)
                stateRef.current.currentY = 0
            }
        }

        // Attach non-passive listener for touchmove to allow preventing default
        container.addEventListener('touchstart', handleTouchStart, { passive: true })
        container.addEventListener('touchmove', handleTouchMove, { passive: false })
        container.addEventListener('touchend', handleTouchEnd)
        container.addEventListener('touchcancel', handleTouchEnd)

        return () => {
            container.removeEventListener('touchstart', handleTouchStart)
            container.removeEventListener('touchmove', handleTouchMove)
            container.removeEventListener('touchend', handleTouchEnd)
            container.removeEventListener('touchcancel', handleTouchEnd)
        }
    }, [refreshing, onRefresh, threshold, externalRefreshing])

    return (
        <div
            ref={containerRef}
            className={cn("relative min-h-0 flex-1 flex flex-col", className)}
        >
            {/* Loading Indicator */}
            <div
                className="absolute top-0 left-0 right-0 flex justify-center items-center pointer-events-none transition-transform duration-200 ease-out"
                style={{
                    height: `${threshold}px`,
                    transform: `translateY(${currentY > 0 ? (refreshing ? 0 : currentY - threshold) : -threshold}px)`,
                    opacity: currentY > 0 || refreshing ? 1 : 0
                }}
            >
                <div className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-full bg-background shadow-md border",
                    refreshing && "animate-spin"
                )}>
                    <Loader2 className={cn("h-4 w-4 text-primary", !refreshing && "rotate-0")} style={{ transform: !refreshing ? `rotate(${currentY * 3}deg)` : undefined }} />
                </div>
            </div>

            {/*
              Content Container — currentY가 0이고 refreshing이 아닐 때는 transform을 아예
              적용하지 않는다. CSS spec상 transform이 걸린 요소는 자식 position:fixed의
              containing block이 viewport에서 자기 자신으로 바뀌므로, 항상 transform을
              걸어두면 페이지 안의 모든 fixed 요소(예: 비교 패널, FAB)가 viewport가 아닌
              본문 끝 기준으로 attach돼 모바일에서 스크롤 끝까지 가야 보이게 된다.
            */}
            <div
                className="flex-1 flex flex-col"
                style={{
                    transform: currentY > 0 || refreshing ? `translateY(${currentY}px)` : undefined,
                    transition: stateRef.current.isPulling ? 'none' : 'transform 0.3s ease-out'
                }}
            >
                {children}
            </div>
        </div>
    )
}
