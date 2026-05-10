'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'

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
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

interface AccountLike {
    id: string
    name: string
    holdingsCount: number
}

interface Props {
    account: AccountLike
    isLastAccount: boolean
    onClose: () => void
    onConfirm: () => Promise<void> | void
}

/**
 * 계좌 삭제 확인 다이얼로그.
 *
 * 메시지 3단계:
 *  1) 보유 종목 없음 → "[계좌명] 을(를) 삭제하시겠습니까?"
 *  2) 보유 종목 있음 → "[계좌명] 에 N 개 종목이 있습니다. 모두 함께 삭제됩니다."
 *  3) 마지막 계좌    → 위 메시지 + 추가 강조 "삭제 후 보유 자산이 아무것도 남지 않습니다"
 */
export function AccountDeleteDialog({ account, isLastAccount, onClose, onConfirm }: Props) {
    const { language } = useLanguage()
    const t = translations[language].accountManagement
    const [submitting, setSubmitting] = useState(false)

    const hasHoldings = account.holdingsCount > 0

    // 메인 확인 메시지 (token interpolation)
    const mainMessage = hasHoldings
        ? t.deleteConfirmWithHoldings
              .replace('{name}', account.name)
              .replace('{count}', String(account.holdingsCount))
        : t.deleteConfirmEmpty.replace('{name}', account.name)

    const handleConfirm = async () => {
        setSubmitting(true)
        try {
            await onConfirm()
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <AlertDialog open onOpenChange={(v) => !v && !submitting && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        {(hasHoldings || isLastAccount) && (
                            <AlertTriangle className="w-5 h-5 text-destructive" aria-hidden />
                        )}
                        {t.deleteTitle}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        <span className="block">{mainMessage}</span>
                        {isLastAccount && (
                            <span className="block font-semibold text-destructive">
                                {t.deleteLastWarning}
                            </span>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={submitting}>
                        {t.deleteCancelAction}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            // Radix 가 기본적으로 닫아버리는 걸 막고 직접 컨트롤
                            e.preventDefault()
                            handleConfirm()
                        }}
                        disabled={submitting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {submitting ? t.deleting : t.deleteConfirmAction}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
