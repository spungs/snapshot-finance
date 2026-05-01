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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { deleteAccount } from '@/app/actions/delete-account'
import { cn } from '@/lib/utils'

interface DeleteAccountDialogProps {
    className?: string
    variant?: 'icon' | 'item' | 'settings-row'
}

export function DeleteAccountDialog({ className, variant = 'icon' }: DeleteAccountDialogProps) {
    const { language } = useLanguage()
    const t = translations[language]
    const [isDeleting, setIsDeleting] = useState(false)
    const [verifyInput, setVerifyInput] = useState('')

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
                ) : variant === 'settings-row' ? (
                    <button
                        className={cn(
                            "w-full flex items-center gap-2 px-5 py-4 text-left text-destructive hover:bg-card-hover transition-colors",
                            className,
                        )}
                    >
                        <Trash2 className="w-4 h-4 shrink-0" />
                        <span className="flex-1 text-[14px] font-semibold">
                            {t.landing.deleteAccount}
                        </span>
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
                <div className="py-4 space-y-2">
                    <Label htmlFor="verify-delete" className="text-sm font-medium">
                        {t.landing.deleteAccountVerifyLabel.split('**').map((part, i) =>
                            i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                        )}
                    </Label>
                    <Input
                        id="verify-delete"
                        value={verifyInput}
                        onChange={(e) => setVerifyInput(e.target.value)}
                        placeholder={t.landing.deleteConfirmationPhrase}
                        className="font-mono bg-red-50 border-red-200 focus-visible:ring-red-500"
                        autoComplete="off"
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>{t.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault()
                            handleDelete()
                        }}
                        disabled={isDeleting || verifyInput !== t.landing.deleteConfirmationPhrase}
                        className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    >
                        {isDeleting ? t.deleting : t.delete}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
