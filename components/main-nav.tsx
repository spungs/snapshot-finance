'use client'

import React from 'react'
import Link from 'next/link'
import { Camera } from 'lucide-react'
import { NavLinks } from '@/components/dashboard/nav-links'
import { MobileNav } from '@/components/mobile-nav'

interface MainNavProps {
    user?: any
}

export function MainNav({ user }: MainNavProps) {
    return (
        <header className="bg-white border-b sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link href={user ? "/dashboard" : "/"} className="flex items-center">
                        <div className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <Camera className="h-6 w-6" />
                            Snapshot Finance
                        </div>
                    </Link>
                    <div className="hidden sm:block">
                        <NavLinks user={user} />
                    </div>
                    <MobileNav type={user ? "dashboard" : "landing"} user={user} />
                </div>
            </div>
        </header>
    )
}
