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
        currentY: 0
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
            if (window.scrollY === 0 && !refreshing) {
                stateRef.current.startY = e.touches[0].clientY
                stateRef.current.isPulling = true
            } else {
                stateRef.current.isPulling = false
            }
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (!stateRef.current.isPulling || refreshing) return

            const y = e.touches[0].clientY
            const diff = y - stateRef.current.startY

            if (diff > 0 && window.scrollY <= 0) { // Allow slight tolerance or exact 0
                // Logic to support nested scrolling if needed, but for now strict top check

                if (e.cancelable) {
                    e.preventDefault() // Key to preventing native scroll/overscroll
                }

                // Add resistance
                const damped = Math.min(diff * 0.5, threshold * 1.5)
                stateRef.current.currentY = damped
                setCurrentY(damped)
            } else {
                // If we scroll back up (negative diff) or user scrolled down content
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
            className={cn("relative min-h-[50vh]", className)}
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

            {/* Content Container */}
            <div
                style={{
                    transform: `translateY(${currentY}px)`,
                    transition: stateRef.current.isPulling ? 'none' : 'transform 0.3s ease-out'
                }}
            >
                {children}
            </div>
        </div>
    )
}
