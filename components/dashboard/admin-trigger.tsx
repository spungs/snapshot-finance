'use client'

import { useState, useEffect } from 'react'
import { AdminDialog } from './admin-dialog'
import { cn } from '@/lib/utils'

interface AdminTriggerProps {
    children: React.ReactNode
    className?: string
}

export function AdminTrigger({ children, className }: AdminTriggerProps) {
    const [clickCount, setClickCount] = useState(0)
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        if (clickCount === 0) return

        const timer = setTimeout(() => {
            setClickCount(0)
        }, 3000) // Reset if not clicked 10 times within 3 seconds (fairly fast)

        if (clickCount >= 10) {
            setIsOpen(true)
            setClickCount(0)
        }

        return () => clearTimeout(timer)
    }, [clickCount])

    return (
        <>
            <div
                className={cn("cursor-pointer select-none", className)}
                onClick={() => {
                    setClickCount((prev) => prev + 1)
                }}
            >
                {children}
            </div>
            <AdminDialog open={isOpen} onOpenChange={setIsOpen} />
        </>
    )
}
