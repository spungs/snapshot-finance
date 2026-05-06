'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { logout } from '@/app/actions'
import { translations } from '@/lib/i18n/translations'
import { DeleteAccountDialog } from '@/components/delete-account-dialog'
import { Switch } from '@/components/ui/switch'
import { toggleAutoSnapshot } from '@/app/actions'


interface MobileNavProps {
    type: 'landing' | 'dashboard'
    user?: any
}

export function MobileNav({ type, user }: MobileNavProps) {
    const [open, setOpen] = useState(false)
    const { language } = useLanguage()
    const { t } = useLanguage()
    const trans = translations[language]

    // Landing page links (Guest Order: Why Invest, What If, M7 News)
    const landingLinks = [
        { href: '#about', label: trans.landing.about },
        { href: '#features', label: trans.landing.features },
        { href: '/dashboard/why', label: t('whyInvest') },
        { href: '/dashboard/what-if', label: t('whatIf') },
        { href: '/news', label: trans.m7News },
    ]

    // Dashboard links (Auth Order: What If, M7 News, Why Invest)
    const allDashboardLinks = [
        { href: '/dashboard', label: t('dashboard'), protected: true },
        { href: '/dashboard/snapshots', label: t('snapshots'), protected: true },
        { href: '/dashboard/simulation', label: t('simulation'), protected: true },
        { href: '/dashboard/what-if', label: t('whatIf'), protected: false },
        { href: '/news', label: trans.m7News, protected: false },
        { href: '/dashboard/why', label: t('whyInvest'), protected: false }, // Explicitly added here too
    ]

    const guestDashboardLinks = [
        { href: '/', label: t('home') },
        ...allDashboardLinks.filter(link => !link.protected)
    ]

    const dashboardLinks = user
        ? allDashboardLinks
        : guestDashboardLinks

    const links = type === 'landing' ? landingLinks : dashboardLinks

    return (
        <div className="sm:hidden">
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent showCloseButton={false} className="w-full h-full max-w-full m-0 p-0 border-none rounded-none bg-background/95 backdrop-blur-sm flex flex-col">
                    <DialogTitle className="sr-only">Navigation Menu</DialogTitle>
                    <div className="flex items-center justify-between p-4 border-b">
                        {type === 'dashboard' ? (
                            <Link
                                href="/dashboard"
                                className="flex items-center font-bold text-xl"
                                onClick={() => setOpen(false)}
                            >
                                <div className="flex items-center font-bold text-xl">
                                    <Image src="/logo.png" alt="Snapshot Finance" width={28} height={28} className="mr-2" />
                                    Snapshot Finance
                                </div>
                            </Link>
                        ) : (
                            <Link
                                href="/"
                                className="flex items-center font-bold text-xl"
                                onClick={() => setOpen(false)}
                            >
                                <Image src="/logo.png" alt="Snapshot Finance" width={28} height={28} className="mr-2" />
                                Snapshot Finance
                            </Link>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                            <X className="h-6 w-6" />
                            <span className="sr-only">Close menu</span>
                        </Button>
                    </div>

                    <nav className="flex flex-col p-6 gap-6 text-lg font-medium">
                        {links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="hover:text-primary transition-colors py-2 border-b border-border/50"
                                onClick={() => setOpen(false)}
                            >
                                {link.label}
                            </Link>
                        ))}

                        {type === 'landing' && (
                            <div className="flex flex-col gap-4 mt-4">
                                <Link href="/dashboard" onClick={() => setOpen(false)}>
                                    <Button variant="outline" className="w-full text-lg h-12">
                                        {trans.landing.login}
                                    </Button>
                                </Link>
                            </div>
                        )}

                        {type === 'dashboard' && (
                            <>
                                {user ? (
                                    <>
                                        {/* Auto Snapshot Toggle */}
                                        <div className="flex items-center justify-between py-4 border-b border-border/50">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-semibold">{t('autoSnapshot')}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {user.isAutoSnapshotEnabled ? t('autoSnapshotOn') : t('autoSnapshotOff')}
                                                </span>
                                            </div>
                                            <Switch
                                                checked={user.isAutoSnapshotEnabled}
                                                onCheckedChange={async (checked) => {
                                                    await toggleAutoSnapshot(checked)
                                                }}
                                            />
                                        </div>

                                        <button
                                            onClick={() => {
                                                setOpen(false)
                                                logout()
                                            }}
                                            className="flex items-center gap-2 text-red-600 hover:text-red-700 py-2 border-b border-border/50 text-left"
                                        >
                                            <LogOut className="h-5 w-5" />
                                            {t('logout') || 'Logout'}
                                        </button>
                                        <DeleteAccountDialog variant="item" />
                                    </>
                                ) : (
                                    <Link href="/dashboard" onClick={() => setOpen(false)}>
                                        <Button variant="outline" className="w-full text-lg h-12">
                                            {trans.landing.login || 'Login'}
                                        </Button>
                                    </Link>
                                )}
                            </>
                        )}
                    </nav>
                </DialogContent>
            </Dialog>
        </div >
    )
}
