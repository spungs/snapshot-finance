'use client'

import { useState, useTransition, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Pencil, Trash2, GripVertical, Check, X, Loader2 } from 'lucide-react'

import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { cn } from '@/lib/utils'

import {
    createAccount,
    renameAccount,
    reorderAccounts,
    deleteAccount,
} from '@/app/actions/account-actions'
import { AccountDeleteDialog } from '@/components/dashboard/account-delete-dialog'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface AccountListItem {
    id: string
    name: string
    displayOrder: number
    holdingsCount: number
}

// L1 localStorage 캐시 키 — 다음 페이지 진입 시 mount 즉시 stale 표시(체감 0ms)용.
// 다른 사용자가 같은 디바이스에 로그인하는 흔치 않은 경우, NextAuth signOut hook 이
// 별도로 비우지 않더라도 자연스럽게 다음 fetch 결과로 덮어써짐.
const LOCAL_CACHE_KEY = 'snapshot-finance:accounts:cache:v1'

function loadCache(): AccountListItem[] | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = window.localStorage.getItem(LOCAL_CACHE_KEY)
        return raw ? (JSON.parse(raw) as AccountListItem[]) : null
    } catch { return null }
}
function saveCache(data: AccountListItem[]) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data))
    } catch { /* quota — 무시 */ }
}

export function AccountsClient() {
    const router = useRouter()
    const { language } = useLanguage()
    const t = translations[language].accountManagement

    // L1 SWR — 첫 렌더는 SSR 일관성 위해 빈 배열. mount 후 useEffect 가:
    //   1) localStorage stale 즉시 표시 (체감 0ms)
    //   2) /api/accounts (L2 Redis hit 시 ~20ms) 백그라운드 fetch
    // 같은 페이지 mutation 은 setAccounts 직접 호출로 즉시 반영, localStorage 도 자동 갱신.
    const [accounts, _setAccounts] = useState<AccountListItem[]>([])
    const [bootstrapped, setBootstrapped] = useState(false)

    // setAccounts wrapper — 호출될 때마다 localStorage 도 자동 갱신해 다음 진입 시 fresh.
    const setAccounts = useCallback(
        (updater: AccountListItem[] | ((prev: AccountListItem[]) => AccountListItem[])) => {
            _setAccounts((prev) => {
                const next = typeof updater === 'function'
                    ? (updater as (p: AccountListItem[]) => AccountListItem[])(prev)
                    : updater
                saveCache(next)
                return next
            })
        },
        [],
    )

    // mount: L1 stale 즉시 표시 + 백그라운드 fresh fetch
    useEffect(() => {
        const cached = loadCache()
        if (cached) _setAccounts(cached)
        let cancelled = false
        ;(async () => {
            try {
                const { accountsApi } = await import('@/lib/api/client')
                const res = await accountsApi.getList()
                if (!cancelled && res.success && res.data) {
                    _setAccounts(res.data)
                    saveCache(res.data)
                }
            } catch { /* network — stale 유지 */ }
            finally {
                if (!cancelled) setBootstrapped(true)
            }
        })()
        return () => { cancelled = true }
    }, [])

    const [addOpen, setAddOpen] = useState(false)
    const [renameTarget, setRenameTarget] = useState<AccountListItem | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AccountListItem | null>(null)
    const [pending, startTransition] = useTransition()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event
            if (!over || active.id === over.id) return

            const oldIndex = accounts.findIndex((a) => a.id === active.id)
            const newIndex = accounts.findIndex((a) => a.id === over.id)
            if (oldIndex < 0 || newIndex < 0) return

            const prev = accounts // rollback 용 backup
            const next = arrayMove(accounts, oldIndex, newIndex)
            setAccounts(next) // optimistic

            startTransition(async () => {
                const result = await reorderAccounts(next.map((a) => a.id))
                if (!result.success) {
                    setAccounts(prev) // explicit rollback (useEffect 제거됨)
                    toast.error(t.reorderFailed)
                }
            })
        },
        [accounts, router, t.reorderFailed],
    )

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full">
            <section className="px-6 pt-3 pb-4 flex items-center justify-between">
                <div className="min-w-0">
                    <h1 className="hero-serif text-[32px] text-foreground">{t.title}</h1>
                    <p className="text-[12px] text-muted-foreground mt-1">{t.desc}</p>
                </div>
            </section>

            {/* 계좌 목록 */}
            <SectionLabel>{t.accountsLabel}</SectionLabel>
            {accounts.length === 0 ? (
                <div className="mx-4 px-5 py-10 bg-card border border-border text-center text-[13px] text-muted-foreground">
                    {t.empty}
                </div>
            ) : (
                <div className="mx-4 bg-card border border-border">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={accounts.map((a) => a.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {accounts.map((account, idx) => (
                                <SortableRow
                                    key={account.id}
                                    account={account}
                                    isFirst={idx === 0}
                                    onRename={() => setRenameTarget(account)}
                                    onDelete={() => setDeleteTarget(account)}
                                    dragHandleLabel={t.dragHandleLabel}
                                    holdingsCountLabel={t.holdingsCountLabel}
                                    holdingsCountUnit={t.holdingsCountUnit}
                                    renameLabel={t.rename}
                                    deleteLabel={t.delete}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
            )}

            {accounts.length > 1 && (
                <div className="px-6 pt-2">
                    <p className="text-[11px] text-muted-foreground">{t.reorderHint}</p>
                </div>
            )}

            {/* 새 계좌 추가 버튼 */}
            <div className="mx-4 mt-4 mb-8">
                <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    disabled={pending}
                    className={cn(
                        'w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground text-[14px] font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50',
                    )}
                >
                    <Plus className="w-4 h-4" />
                    {t.addAccount}
                </button>
            </div>

            <AddAccountDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                onSuccess={(created) => {
                    setAccounts((prev) => [...prev, created])
                    router.refresh()
                }}
            />

            {renameTarget && (
                <RenameAccountDialog
                    account={renameTarget}
                    onClose={() => setRenameTarget(null)}
                    onSuccess={(id, newName) => {
                        setAccounts((prev) =>
                            prev.map((a) => (a.id === id ? { ...a, name: newName } : a)),
                        )
                        router.refresh()
                    }}
                />
            )}

            {deleteTarget && (
                <AccountDeleteDialog
                    account={deleteTarget}
                    isLastAccount={accounts.length === 1}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={async () => {
                        const result = await deleteAccount(deleteTarget.id)
                        if (result.success) {
                            setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id))
                            toast.success(t.deleteSuccess)
                            setDeleteTarget(null)
                            router.refresh()
                        } else {
                            toast.error(t.deleteFailed)
                        }
                    }}
                />
            )}
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

function SortableRow({
    account,
    isFirst,
    onRename,
    onDelete,
    dragHandleLabel,
    holdingsCountLabel,
    holdingsCountUnit,
    renameLabel,
    deleteLabel,
}: {
    account: AccountListItem
    isFirst: boolean
    onRename: () => void
    onDelete: () => void
    dragHandleLabel: string
    holdingsCountLabel: string
    holdingsCountUnit: string
    renameLabel: string
    deleteLabel: string
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: account.id,
    })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'flex items-center gap-3 px-4 py-3.5 min-h-[60px] bg-card',
                !isFirst && 'border-t border-border',
                isDragging && 'shadow-md z-10 relative',
            )}
        >
            <button
                type="button"
                aria-label={dragHandleLabel}
                {...attributes}
                {...listeners}
                className="touch-none p-1 -ml-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
            >
                <GripVertical className="w-4 h-4" />
            </button>

            <div className="flex-1 min-w-0">
                <div className="font-serif text-[15px] font-semibold text-foreground truncate">
                    {account.name}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                    {holdingsCountLabel}: {account.holdingsCount}
                    {holdingsCountUnit}
                </div>
            </div>

            <button
                type="button"
                onClick={onRename}
                aria-label={renameLabel}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
                <Pencil className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={onDelete}
                aria-label={deleteLabel}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    )
}

function AddAccountDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    onSuccess: (created: AccountListItem) => void
}) {
    const { language } = useLanguage()
    const t = translations[language].accountManagement
    const [name, setName] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (open) {
            setName('')
            // 다이얼로그 열림 직후 포커스
            const id = setTimeout(() => inputRef.current?.focus(), 100)
            return () => clearTimeout(id)
        }
    }, [open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) {
            toast.error(t.nameRequired)
            return
        }
        setSubmitting(true)
        try {
            const result = await createAccount(trimmed)
            if (result.success && result.data) {
                toast.success(t.createSuccess)
                onSuccess({
                    id: result.data.id,
                    name: trimmed,
                    displayOrder: 0,
                    holdingsCount: 0,
                })
                onOpenChange(false)
            } else {
                if (result.success === false && result.error === 'NAME_TOO_LONG') {
                    toast.error(t.nameTooLong)
                } else if (result.success === false && result.error === 'NAME_REQUIRED') {
                    toast.error(t.nameRequired)
                } else {
                    toast.error(t.createFailed)
                }
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{t.addAccountTitle}</DialogTitle>
                    <DialogDescription>{t.addAccountHint}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t.addAccountPlaceholder}
                        maxLength={30}
                        disabled={submitting}
                    />
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                        >
                            {t.cancel}
                        </Button>
                        <Button type="submit" disabled={submitting || !name.trim()}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {submitting ? t.creating : t.create}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function RenameAccountDialog({
    account,
    onClose,
    onSuccess,
}: {
    account: AccountListItem
    onClose: () => void
    onSuccess: (id: string, newName: string) => void
}) {
    const { language } = useLanguage()
    const t = translations[language].accountManagement
    const [name, setName] = useState(account.name)
    const [submitting, setSubmitting] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const id = setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        }, 100)
        return () => clearTimeout(id)
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) {
            toast.error(t.nameRequired)
            return
        }
        if (trimmed === account.name) {
            onClose()
            return
        }
        setSubmitting(true)
        try {
            const result = await renameAccount(account.id, trimmed)
            if (result.success) {
                toast.success(t.renameSuccess)
                onSuccess(account.id, trimmed)
                onClose()
            } else {
                if (result.error === 'NAME_TOO_LONG') {
                    toast.error(t.nameTooLong)
                } else if (result.error === 'NAME_REQUIRED') {
                    toast.error(t.nameRequired)
                } else {
                    toast.error(t.renameFailed)
                }
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{t.renameTitle}</DialogTitle>
                    <DialogDescription className="sr-only">{t.renameTitle}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t.renamePlaceholder}
                        maxLength={30}
                        disabled={submitting}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                            <X className="w-4 h-4 mr-1" />
                            {t.cancel}
                        </Button>
                        <Button type="submit" disabled={submitting || !name.trim()}>
                            {submitting ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4 mr-1" />
                            )}
                            {t.saveName}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
