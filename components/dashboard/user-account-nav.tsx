'use client'

import { useState } from 'react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { User, LogOut, Settings, Camera, Check } from 'lucide-react'
import { logout, toggleAutoSnapshot } from '@/app/actions'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { DeleteAccountDialog } from '@/components/delete-account-dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface UserAccountNavProps {
    user: {
        id: string
        name?: string | null
        email?: string | null
        image?: string | null
        isAutoSnapshotEnabled?: boolean
    }
}

export function UserAccountNav({ user }: UserAccountNavProps) {
    const { language } = useLanguage()
    const t = translations[language]
    const [isAutoSnapshot, setIsAutoSnapshot] = useState(user.isAutoSnapshotEnabled ?? false)
    const [isPending, setIsPending] = useState(false)

    const handleToggleAutoSnapshot = async () => {
        setIsPending(true)
        const newStatus = !isAutoSnapshot
        try {
            const result = await toggleAutoSnapshot(newStatus)
            if (result.success) {
                setIsAutoSnapshot(newStatus)
            }
        } catch (error) {
            console.error('Error toggling auto snapshot:', error)
        } finally {
            setIsPending(false)
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="relative h-11 w-11 rounded-full focus-visible:ring-0 focus-visible:ring-offset-0"
                    aria-label="User menu"
                >
                    <User className="h-5 w-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.name || 'User'}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {user.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center justify-between font-normal py-2">
                    <div className="flex flex-col space-y-0.5">
                        <span className="text-sm font-medium">{t.autoSnapshot}</span>
                        <span className="text-[10px] text-muted-foreground">
                            {isAutoSnapshot ? t.autoSnapshotOn : t.autoSnapshotOff}
                        </span>
                    </div>
                    <Switch
                        checked={isAutoSnapshot}
                        onCheckedChange={handleToggleAutoSnapshot}
                        disabled={isPending}
                    />
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => logout()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t.logout || 'Logout'}</span>
                </DropdownMenuItem>
                <div className="px-2 py-1.5">
                    <DeleteAccountDialog variant="item" />
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
