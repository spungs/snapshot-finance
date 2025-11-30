'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'

export function NavLinks() {
    const pathname = usePathname()
    const { t } = useLanguage()

    const links = [
        { href: '/dashboard', label: t('dashboard') },
        { href: '/dashboard/snapshots', label: t('snapshots') },
        { href: '/dashboard/simulation', label: t('simulation') },
    ]

    return (
        <nav className="flex space-x-4">
            {links.map((link) => (
                <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                        "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                        pathname === link.href
                            ? "bg-gray-100 text-gray-900"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                >
                    {link.label}
                </Link>
            ))}
        </nav>
    )
}
