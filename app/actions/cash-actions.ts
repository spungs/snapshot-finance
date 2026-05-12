'use server'

import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { holdingService } from "@/lib/services/holding-service"
import {
    validateCashAmount,
    validateCashAccounts,
    sumCashAccounts,
    DEFAULT_CASH_LABEL,
} from "@/lib/validation/portfolio-input"
import type { CashAccount } from "@/types/cash"

export type CashActionResult =
    | { success: true }
    | { success: false; error: string; code?: 'MULTIPLE_ACCOUNTS' | 'UNAUTHORIZED' | 'VALIDATION' | 'DB_FAILED' }

// 다이얼로그용: 계좌별 예수금 배열을 받아 합계와 함께 한 트랜잭션으로 저장한다.
export async function updateCashAccounts(accounts: unknown): Promise<CashActionResult> {
    const session = await auth()
    if (!session?.user?.id) {
        return { success: false, error: "Unauthorized", code: 'UNAUTHORIZED' }
    }

    const validated = validateCashAccounts(accounts)
    if (!validated.ok) {
        return { success: false, error: validated.error, code: 'VALIDATION' }
    }

    try {
        const total = sumCashAccounts(validated.value)
        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                cashBalance: total,
                cashAccounts: validated.value.length > 0
                    ? (validated.value as unknown as Prisma.InputJsonValue)
                    : Prisma.DbNull,
            },
        })
        await holdingService.invalidate(session.user.id)
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error("Failed to update cash accounts:", error)
        return { success: false, error: "Failed to update cash accounts", code: 'DB_FAILED' }
    }
}

// AI 챗 등에서 합계 단일 값으로 예수금을 변경하려 할 때 호출된다.
// 사용자가 명시적으로 분리한 여러 계좌를 자의적으로 합치지 않도록,
// 계좌가 2개 이상이면 거부하고 다이얼로그에서 직접 수정하도록 안내한다 (B안).
export async function updateCashBalance(amount: number): Promise<CashActionResult> {
    const session = await auth()
    if (!session?.user?.id) {
        return { success: false, error: "Unauthorized", code: 'UNAUTHORIZED' }
    }

    const validated = validateCashAmount(amount)
    if (!validated.ok) {
        return { success: false, error: validated.error, code: 'VALIDATION' }
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { cashAccounts: true },
        })
        const current = (user?.cashAccounts as unknown as CashAccount[] | null) ?? []

        if (current.length > 1) {
            return {
                success: false,
                error: '예수금이 여러 계좌로 나뉘어 있어 자동 변경할 수 없습니다. 예수금 다이얼로그에서 직접 수정해주세요.',
                code: 'MULTIPLE_ACCOUNTS',
            }
        }

        // 0개 → 기본 라벨로 새 행, 1개 → 기존 라벨/id 유지하며 금액만 갱신
        const existing = current[0]
        const nextAccounts: CashAccount[] = [{
            id: existing?.id ?? randomUUID(),
            label: existing?.label ?? DEFAULT_CASH_LABEL,
            amount: String(validated.value),
        }]

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                cashBalance: validated.value,
                cashAccounts: nextAccounts as unknown as Prisma.InputJsonValue,
            },
        })
        await holdingService.invalidate(session.user.id)
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error("Failed to update cash balance:", error)
        return { success: false, error: "Failed to update cash balance", code: 'DB_FAILED' }
    }
}
