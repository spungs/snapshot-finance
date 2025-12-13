'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions'
import { DeleteAccountDialog } from '@/components/delete-account-dialog'

export function NavLinks() {
    const pathname = usePathname()
    const { t } = useLanguage()

    const links = [
        { href: '/dashboard', label: t('dashboard') },
        { href: '/dashboard/snapshots', label: t('snapshots') },
        { href: '/dashboard/simulation', label: t('simulation') },
    ]

    return (
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-hide items-center">
            {links.map((link) => {
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                            'px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap',
                            pathname === link.href
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-900 hover:bg-gray-100'
                        )}
                    >
                        {link.label}
                    </Link>
                )
            })}
            <button
                onClick={() => logout()}
                className="px-2 sm:px-3 py-2 rounded-md text-gray-900 hover:bg-gray-100 flex items-center"
                title={t('logout') || 'Logout'}
            >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <DeleteAccountDialog />
        </nav>
    )
}
