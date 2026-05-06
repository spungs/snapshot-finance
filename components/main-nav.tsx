'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { NavLinks } from '@/components/dashboard/nav-links'
import { MobileNav } from '@/components/mobile-nav'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface MainNavProps {
    user?: any
}

export function MainNav({ user }: MainNavProps) {
    return (
        <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link href={user ? "/dashboard" : "/"} prefetch={true} className="flex items-center">
                        <div className="text-xl font-bold text-foreground flex items-center gap-2">
                            <Image src="/logo.png" alt="Snapshot Finance" width={28} height={28} priority />
                            Snapshot Finance
                        </div>
                    </Link>
                    <div className="hidden sm:block">
                        <NavLinks user={user} />
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="sm:hidden">
                            <ThemeToggle />
                        </div>
                        <MobileNav type={user ? "dashboard" : "landing"} user={user} />
                    </div>
                </div>
            </div>
        </header>
    )
}
