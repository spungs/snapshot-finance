'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, LogOut, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/context'
import { logout } from '@/app/actions'
import { translations } from '@/lib/i18n/translations'
import { DeleteAccountDialog } from '@/components/delete-account-dialog'

interface MobileNavProps {
    type: 'landing' | 'dashboard'
}

export function MobileNav({ type }: MobileNavProps) {
    const [open, setOpen] = useState(false)
    const { language } = useLanguage()
    const { t } = useLanguage()
    const trans = translations[language]

    // Landing page links
    const landingLinks = [
        { href: '#about', label: trans.landing.about },
        { href: '#features', label: trans.landing.features },
    ]

    // Dashboard links
    const dashboardLinks = [
        { href: '/dashboard', label: t('dashboard') },
        { href: '/dashboard/snapshots', label: t('snapshots') },
        { href: '/dashboard/simulation', label: t('simulation') },
    ]

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
                        <Link
                            href={type === 'dashboard' ? "/dashboard" : "/"}
                            className="flex items-center font-bold text-xl"
                            onClick={() => setOpen(false)}
                        >
                            <Camera className="mr-2 h-6 w-6" />
                            Snapshot Finance
                        </Link>
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
                                <Link href="/dashboard" onClick={() => setOpen(false)}>
                                    <Button className="w-full text-lg h-12">
                                        {trans.landing.start}
                                    </Button>
                                </Link>
                            </div>
                        )}

                        {type === 'dashboard' && (
                            <>
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
                        )}
                    </nav>
                </DialogContent>
            </Dialog>
        </div >
    )
}
