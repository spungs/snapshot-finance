'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Decimal from 'decimal.js'
import {
    validateQuantity,
    validateAveragePrice,
    validateCurrency,
} from '@/lib/validation/portfolio-input'
import { holdingService } from '@/lib/services/holding-service'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { kisClient } from '@/lib/api/kis-client'
import { assertAccountOwnership as checkAccountOwnership } from '@/lib/auth-helpers'

type ActionResult<T = unknown> =
    | { success: true; data?: T }
    | { success: false; error: string }

/**
 * 다중 계좌 도입 후 종목 추가/수정/삭제는 반드시 accountId 와 함께 들어온다.
 * 기존 /api/holdings REST 라우트와 별도로 server action 진입점을 둔다 —
 * 폼 제출 / RSC 액션에서 accountId 필수 검증을 강제하기 위함.
 *
 * IDOR 방어: 모든 변이 진입점에서 accountId 가 session.user.id 의 소유인지 확인.
 */

async function fetchCurrentPrice(stockCode: string, market: string): Promise<number> {
    try {
        let marketType: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI'
        if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS') {
            marketType = 'US'
        } else if (market === 'KOSDAQ' || market === 'KQ') {
            marketType = 'KOSDAQ'
        }
        const priceData = await kisClient.getCurrentPrice(stockCode, marketType)
        return priceData.price
    } catch {
        return 0
    }
}

/** 입력 accountId 가 현재 로그인 유저 소유인지 확인 — 모든 변이 진입점에서 호출. */
async function assertAccountOwnership(
    accountId: string,
    userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!accountId || typeof accountId !== 'string') {
        return { ok: false, error: '계좌 정보가 누락되었습니다.' }
    }
    const account = await checkAccountOwnership(accountId, userId)
    if (!account) {
        return { ok: false, error: '계좌를 찾을 수 없거나 접근 권한이 없습니다.' }
    }
    return { ok: true }
}

interface CreateHoldingInput {
    accountId: string
    stockId: string
    quantity: number | string
    averagePrice: number | string
    currency?: 'KRW' | 'USD'
    purchaseRate?: number
    /** merge: 기존 보유에 평단 가중평균 합산 / overwrite: 덮어쓰기 / new: 새 row 강제 */
    mode?: 'merge' | 'overwrite' | 'new'
}

export async function createHolding(input: CreateHoldingInput): Promise<ActionResult> {
    const session = await auth()
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const ownership = await assertAccountOwnership(input.accountId, userId)
    if (!ownership.ok) return { success: false, error: ownership.error }

    if (!input.stockId || typeof input.stockId !== 'string') {
        return { success: false, error: '종목 정보가 누락되었습니다.' }
    }

    const qtyResult = validateQuantity(input.quantity)
    if (!qtyResult.ok) return { success: false, error: qtyResult.error }
    const priceResult = validateAveragePrice(input.averagePrice)
    if (!priceResult.ok) return { success: false, error: priceResult.error }

    let currency: 'KRW' | 'USD' | undefined
    if (input.currency !== undefined) {
        const r = validateCurrency(input.currency)
        if (!r.ok) return { success: false, error: r.error }
        currency = r.value
    }

    const stock = await prisma.stock.findUnique({ where: { id: input.stockId } })
    if (!stock) {
        return { success: false, error: '종목을 찾을 수 없습니다.' }
    }

    if (!currency) {
        const usMarkets = ['US', 'NAS', 'NYS', 'AMS']
        currency = usMarkets.includes(stock.market || '') ? 'USD' : 'KRW'
    }

    let purchaseRate = input.purchaseRate ?? 1
    if (currency === 'USD' && (!purchaseRate || purchaseRate === 1)) {
        const rate = await getUsdExchangeRate()
        if (rate > 0) purchaseRate = rate
    }

    const currentPrice = await fetchCurrentPrice(stock.stockCode, stock.market || 'Unknown')
    const safeCurrentPrice = Number.isFinite(currentPrice) ? currentPrice : 0

    const mode = input.mode ?? 'overwrite'
    const quantity = qtyResult.value
    const averagePrice = priceResult.value

    try {
        // 같은 계좌 + 같은 종목 unique 제약 ([accountId, stockId]) — 기존 row 가 있으면
        // mode 에 따라 처리.
        const existing = await prisma.holding.findFirst({
            where: { userId, accountId: input.accountId, stockId: input.stockId },
        })

        if (existing && mode === 'merge') {
            const oldQty = existing.quantity
            const oldAvg = new Decimal(existing.averagePrice.toString())
            const newQty = oldQty + quantity
            const oldTotal = oldAvg.times(oldQty)
            const newTotal = new Decimal(averagePrice).times(quantity)
            const newAvg = newQty > 0
                ? oldTotal.plus(newTotal).div(newQty)
                : new Decimal(0)

            await prisma.holding.update({
                where: { id: existing.id },
                data: {
                    quantity: newQty,
                    averagePrice: newAvg.toString(),
                    currentPrice: safeCurrentPrice || existing.currentPrice,
                    currency,
                    purchaseRate,
                    priceUpdatedAt: new Date(),
                },
            })
        } else if (existing && mode === 'overwrite') {
            await prisma.holding.update({
                where: { id: existing.id },
                data: {
                    quantity,
                    averagePrice,
                    currentPrice: safeCurrentPrice,
                    currency,
                    purchaseRate,
                    priceUpdatedAt: new Date(),
                },
            })
        } else {
            // mode === 'new' 또는 신규
            // unique 제약 ([accountId, stockId]) 위반 시 prisma 가 에러 — 호출자가 mode='new' 를 잘못 보낸 것.
            await prisma.holding.create({
                data: {
                    userId,
                    accountId: input.accountId,
                    stockId: input.stockId,
                    quantity,
                    averagePrice,
                    currentPrice: safeCurrentPrice,
                    currency,
                    purchaseRate,
                    priceUpdatedAt: new Date(),
                },
            })
        }

        await holdingService.invalidate(userId)
        revalidatePath('/dashboard/portfolio')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('createHolding failed:', error)
        const message = error instanceof Error ? error.message : '종목 추가에 실패했습니다.'
        return { success: false, error: message }
    }
}

interface UpdateHoldingInput {
    holdingId: string
    quantity?: number | string
    averagePrice?: number | string
    currency?: 'KRW' | 'USD'
    purchaseRate?: number
    /** 계좌 이동 — accountId 변경. 미지정 시 기존 유지. */
    accountId?: string
}

export async function updateHolding(input: UpdateHoldingInput): Promise<ActionResult> {
    const session = await auth()
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    if (!input.holdingId) {
        return { success: false, error: '보유 종목 ID 가 누락되었습니다.' }
    }

    // 보유 row 가 본인 소유인지 확인
    const holding = await prisma.holding.findUnique({
        where: { id: input.holdingId },
        select: { id: true, userId: true },
    })
    if (!holding || holding.userId !== userId) {
        return { success: false, error: '보유 종목을 찾을 수 없습니다.' }
    }

    // 계좌 이동 시 새 accountId 도 본인 소유 검증
    if (input.accountId !== undefined) {
        const ownership = await assertAccountOwnership(input.accountId, userId)
        if (!ownership.ok) return { success: false, error: ownership.error }
    }

    const data: Record<string, unknown> = {}
    if (input.quantity !== undefined) {
        const r = validateQuantity(input.quantity)
        if (!r.ok) return { success: false, error: r.error }
        data.quantity = r.value
    }
    if (input.averagePrice !== undefined) {
        const r = validateAveragePrice(input.averagePrice)
        if (!r.ok) return { success: false, error: r.error }
        data.averagePrice = r.value
    }
    if (input.currency !== undefined) {
        const r = validateCurrency(input.currency)
        if (!r.ok) return { success: false, error: r.error }
        data.currency = r.value
    }
    if (input.purchaseRate !== undefined && input.purchaseRate > 0) {
        data.purchaseRate = input.purchaseRate
    }
    if (input.accountId !== undefined) {
        data.accountId = input.accountId
    }

    try {
        await prisma.holding.update({
            where: { id: input.holdingId },
            data,
        })
        await holdingService.invalidate(userId)
        revalidatePath('/dashboard/portfolio')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('updateHolding failed:', error)
        const message = error instanceof Error ? error.message : '종목 수정에 실패했습니다.'
        return { success: false, error: message }
    }
}

export async function deleteHolding(holdingId: string): Promise<ActionResult> {
    const session = await auth()
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    if (!holdingId) return { success: false, error: '보유 종목 ID 가 누락되었습니다.' }

    const holding = await prisma.holding.findUnique({
        where: { id: holdingId },
        select: { id: true, userId: true },
    })
    if (!holding || holding.userId !== userId) {
        return { success: false, error: '보유 종목을 찾을 수 없습니다.' }
    }

    try {
        await prisma.holding.delete({ where: { id: holdingId } })
        await holdingService.invalidate(userId)
        revalidatePath('/dashboard/portfolio')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('deleteHolding failed:', error)
        const message = error instanceof Error ? error.message : '종목 삭제에 실패했습니다.'
        return { success: false, error: message }
    }
}
