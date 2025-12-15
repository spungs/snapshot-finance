'use client'

import React, { useState, useRef, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PullToRefreshProps {
    children: ReactNode
    onRefresh: () => Promise<void>
    className?: string
}

export function PullToRefresh({ children, onRefresh, className }: PullToRefreshProps) {
    const [startY, setStartY] = useState(0)
    const [currentY, setCurrentY] = useState(0)
    const [refreshing, setRefreshing] = useState(false)
    const [pulling, setPulling] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)
    const threshold = 80 // Pull threshold in pixels

    // Touch Start
    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0 && !refreshing) {
            setStartY(e.touches[0].clientY)
            setPulling(true)
        }
    }

    // Touch Move
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!pulling || refreshing) return

        const y = e.touches[0].clientY
        const diff = y - startY

        // Only allow pulling down when at the top
        if (diff > 0 && window.scrollY === 0) {
            // Add resistance
            const damped = Math.min(diff * 0.5, threshold * 1.5)
            setCurrentY(damped)

            // Prevent default browser refresh only if we are actively pulling
            if (e.cancelable && diff > 10) {
                // Note: preventing default on passive listeners is tricky in modern browsers
                // usually we rely on "overscroll-behavior-y: contain" in CSS
            }
        } else {
            setCurrentY(0)
        }
    }

    // Touch End
    const handleTouchEnd = async () => {
        if (!pulling || refreshing) return

        setPulling(false)

        if (currentY >= threshold) {
            setRefreshing(true)
            setCurrentY(threshold - 10) // Snap to loading position

            try {
                await onRefresh()
            } finally {
                setRefreshing(false)
                setCurrentY(0)
            }
        } else {
            setCurrentY(0) // Snap back
        }
    }

    return (
        <div
            className={cn("relative min-h-[50vh]", className)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
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
                ref={contentRef}
                style={{
                    transform: `translateY(${currentY}px)`,
                    transition: pulling ? 'none' : 'transform 0.3s ease-out'
                }}
            >
                {children}
            </div>
        </div>
    )
}
