'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { logout, toggleAutoSnapshot } from '@/app/actions'
import { Switch } from '@/components/ui/switch'
import { DeleteAccountDialog } from '@/components/delete-account-dialog'
import { ChevronRight, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    user: {
        id: string
        name?: string | null
        email?: string | null
        image?: string | null
        isAutoSnapshotEnabled?: boolean
    }
}

export function SettingsClient({ user }: Props) {
    const { language, setLanguage } = useLanguage()
    const t = translations[language]
    const { theme, setTheme } = useTheme()
    const [isAutoSnapshot, setIsAutoSnapshot] = useState(user.isAutoSnapshotEnabled ?? false)
    const [autoPending, setAutoPending] = useState(false)

    const handleAutoSnapshot = async (next: boolean) => {
        setAutoPending(true)
        try {
            const r = await toggleAutoSnapshot(next)
            if (r.success) setIsAutoSnapshot(next)
        } finally {
            setAutoPending(false)
        }
    }

    const initial = (user.name?.[0] || user.email?.[0] || 'U').toUpperCase()

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full">
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[32px] text-foreground">
                    {t.tabSettings}
                </h1>
            </section>

            {/* Profile card */}
            <div className="mx-4 mb-4 p-5 bg-card border border-border flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
                    {initial}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-serif text-[17px] font-semibold text-foreground truncate">
                        {user.name || 'User'}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {user.email}
                    </div>
                </div>
            </div>

            {/* App settings */}
            <SectionLabel>{t.appSection}</SectionLabel>
            <div className="mx-4 bg-card border border-border">
                {/* Theme */}
                <Row>
                    <RowMain title={t.themeLabel} sub={theme === 'dark' ? 'Dark' : 'Light'} />
                    <SegControl
                        options={[
                            { value: 'light', label: 'Light' },
                            { value: 'dark', label: 'Dark' },
                        ]}
                        value={theme === 'dark' ? 'dark' : 'light'}
                        onChange={v => setTheme(v)}
                    />
                </Row>
                <Row>
                    <RowMain title={t.languageLabel} sub={language === 'ko' ? '한국어' : 'English'} />
                    <SegControl
                        options={[
                            { value: 'ko', label: '한국어' },
                            { value: 'en', label: 'EN' },
                        ]}
                        value={language}
                        onChange={v => setLanguage(v as 'ko' | 'en')}
                    />
                </Row>
                <Row>
                    <RowMain title={t.autoSnapshot} sub={isAutoSnapshot ? t.autoSnapshotOn : t.autoSnapshotOff} />
                    <Switch
                        checked={isAutoSnapshot}
                        onCheckedChange={handleAutoSnapshot}
                        disabled={autoPending}
                    />
                </Row>
            </div>

            {/* Account */}
            <SectionLabel>{t.accountSection}</SectionLabel>
            <div className="mx-4 bg-card border border-border">
                <button
                    type="button"
                    onClick={() => logout()}
                    className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-card-hover transition-colors"
                >
                    <LogOut className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-[14px] font-semibold text-foreground">
                        {t.logout}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
                <div className="border-t border-border">
                    <DeleteAccountDialog variant="settings-row" />
                </div>
            </div>

            {/* Legal */}
            <SectionLabel>{t.legalSection}</SectionLabel>
            <div className="mx-4 mb-4 bg-card border border-border">
                <LinkRow href="/terms" label={t.landing.termsOfService} />
                <LinkRow href="/privacy" label={t.landing.privacyPolicy} divided />
            </div>
        </div>
    )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-6 pt-2 pb-2">
            <span className="eyebrow">{children}</span>
        </div>
    )
}

function Row({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border first:border-t-0">
            {children}
        </div>
    )
}

function RowMain({ title, sub }: { title: string; sub?: string }) {
    return (
        <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-foreground">{title}</div>
            {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
        </div>
    )
}

function SegControl({
    options, value, onChange,
}: {
    options: { value: string; label: string }[]
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div className="flex bg-surface2 p-0.5 rounded-sm">
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={cn(
                        'px-2.5 py-1 text-[11px] font-semibold transition-colors',
                        value === opt.value
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground',
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

function LinkRow({ href, label, divided }: { href: string; label: string; divided?: boolean }) {
    return (
        <Link
            href={href}
            className={cn(
                'flex items-center px-5 py-4 hover:bg-card-hover transition-colors',
                divided && 'border-t border-border',
            )}
        >
            <span className="flex-1 text-[14px] font-semibold text-foreground">{label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
    )
}
