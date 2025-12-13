'use client'

import { useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { deleteAccount } from '@/app/actions/delete-account'
import { cn } from '@/lib/utils'

interface DeleteAccountDialogProps {
    className?: string
    variant?: 'icon' | 'item'
}

export function DeleteAccountDialog({ className, variant = 'icon' }: DeleteAccountDialogProps) {
    const { language } = useLanguage()
    const t = translations[language]
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        try {
            setIsDeleting(true)
            await deleteAccount()
        } catch (error) {
            console.error('Failed to delete account', error)
            setIsDeleting(false)
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                {variant === 'icon' ? (
                    <button
                        className={cn("px-2 sm:px-3 py-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center transition-colors", className)}
                        title={t.landing.deleteAccount}
                    >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                ) : (
                    <button
                        className={cn("flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 py-2 border-b border-border/50 text-left w-full transition-colors", className)}
                    >
                        <Trash2 className="h-5 w-5" />
                        {t.landing.deleteAccount}
                    </button>
                )}
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-5 w-5" />
                        {t.landing.deleteAccountConfirmTitle}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t.landing.deleteAccountConfirmDesc}
                        <br />
                        <span className="font-bold mt-2 block">{t.landing.deleteAccountWarning}</span>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>{t.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault()
                            handleDelete()
                        }}
                        disabled={isDeleting}
                        className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    >
                        {isDeleting ? t.deleting : t.delete}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
