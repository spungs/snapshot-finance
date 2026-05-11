'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    confirmLabel: string
    cancelLabel: string
    /** destructive 면 confirm 버튼이 빨간 색 (삭제 등) */
    variant?: 'default' | 'destructive'
    /** Promise 반환 시 submitting 상태 표시. 성공 시 자동 close. throw 시 close 안 함. */
    onConfirm: () => Promise<void> | void
}

/**
 * shadcn/ui AlertDialog 기반 재사용 확인 다이얼로그.
 * 프로젝트 전역의 window.confirm() 대체 — 디자인 시스템 일관성.
 *
 * 사용 예:
 *   const [open, setOpen] = useState(false)
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="종목 삭제"
 *     description='"삼성전자"를 삭제하시겠습니까?'
 *     confirmLabel="삭제"
 *     cancelLabel="취소"
 *     variant="destructive"
 *     onConfirm={async () => { await deleteHolding(id) }}
 *   />
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant = 'default',
    onConfirm,
}: ConfirmDialogProps) {
    const [submitting, setSubmitting] = useState(false)

    const handleConfirm = async (e: React.MouseEvent) => {
        e.preventDefault()
        if (submitting) return
        setSubmitting(true)
        try {
            await onConfirm()
            onOpenChange(false)
        } catch (err) {
            // onConfirm 가 throw 하면 다이얼로그 열린 상태 유지 — 호출자가 toast 등으로 처리
            console.error('ConfirmDialog onConfirm error:', err)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {description && (
                        <AlertDialogDescription className="whitespace-pre-line">
                            {description}
                        </AlertDialogDescription>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={submitting}>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirm}
                        disabled={submitting}
                        className={
                            variant === 'destructive'
                                ? 'bg-destructive text-white hover:bg-destructive/90'
                                : ''
                        }
                    >
                        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
