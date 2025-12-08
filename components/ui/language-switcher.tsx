'use client'

import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'
import { Globe } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage()

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-full h-12 w-12 shadow-lg bg-background">
                        <Globe className="h-6 w-6" />
                        <span className="sr-only">Change Language</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLanguage('ko')} className={language === 'ko' ? 'bg-accent' : ''}>
                        한국어
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLanguage('en')} className={language === 'en' ? 'bg-accent' : ''}>
                        English
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
