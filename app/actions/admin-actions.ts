'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { holdingService } from '@/lib/services/holding-service'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'
import { assertAccountOwnership } from '@/lib/auth-helpers'
import Decimal from 'decimal.js'

// 일괄 등록 한 번에 처리 가능한 최대 종목 수.
// 트랜잭션 timeout(30s) 안에서 안전하게 끝나는 경험적 상한.
const MAX_BULK_IMPORT_ITEMS = 100

export async function updateCashBalance(amount: number) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { cashBalance: amount }
        })
        await holdingService.invalidate(session.user.id)
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error("Failed to update cash:", error)
        return { success: false, error: "Database error" }
    }
}

// Helper for currency detection
function getCurrencyForMarket(market?: string | null, stockCode?: string): string {
    // 1. Explicit Market Check
    if (market) {
        const cleanMarket = market.toUpperCase().trim()
        const US_MARKETS = ['NAS', 'NYS', 'AMS']
        if (US_MARKETS.includes(cleanMarket)) return 'USD'
    }

    // 2. Heuristic based on Stock Code (If market is unknown/missing or not determinative)
    // Korean stocks are typically 6 digits (e.g., 005930)
    // US stocks are typically alphabetic (e.g., AAPL)
    if (stockCode) {
        const isKoreanCode = /^\d{6}$/.test(stockCode)
        const isUSCode = /^[A-Z]{1,5}$/i.test(stockCode)

        if (isUSCode) return 'USD'
        if (isKoreanCode) return 'KRW'
    }

    return 'KRW' // Default
}

// ----------------------------------------------------------------------
// Account list — 일괄 등록 모달의 셀렉터에서 사용.
// Agent 1 의 BrokerageAccount CRUD UI 와 별개로, 일괄 등록 단독으로 동작 가능하도록
// 자체 list server action 을 둔다(읽기 전용, 가벼움).
// ----------------------------------------------------------------------
export type BrokerageAccountSummary = {
    id: string
    name: string
    displayOrder: number
}

export async function listBrokerageAccountsForBulkImport(): Promise<{
    success: boolean
    accounts: BrokerageAccountSummary[]
    error?: string
}> {
    const session = await auth()
    if (!session?.user?.id) return { success: false, accounts: [], error: 'Unauthorized' }

    try {
        const accounts = await prisma.brokerageAccount.findMany({
            where: { userId: session.user.id },
            select: { id: true, name: true, displayOrder: true },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        })
        return { success: true, accounts }
    } catch (error) {
        console.error('Failed to list brokerage accounts:', error)
        return { success: false, accounts: [], error: 'Database error' }
    }
}

// ----------------------------------------------------------------------
// New Types
// ----------------------------------------------------------------------
export type ImportItem = {
    identifier: string
    quantity: number
    averagePrice: number
    /** USD 종목 매입 시점 환율. KRW 종목은 의미 없음(무시). 미입력 시 서버에서 현재 환율로 자동 채움. */
    purchaseRate?: number
}

export type AnalyzedItem = {
    identifier: string // The raw input text
    stockId?: string
    stockName?: string
    stockCode?: string
    market?: string
    currency?: string // Detected currency
    inputQty: number
    inputPrice: number
    inputRate?: number // 사용자가 입력한 환율 (있으면)
    effectiveRate?: number // 최종 적용될 환율 (자동 채움 포함)
    rateAutoFilled?: boolean // true면 UI 에서 "자동 채움" 배지 표시
    currentQty: number
    currentPrice: number
    status: 'resolved' | 'unresolved'
}

export type ImportAnalysisResult = {
    success: boolean
    resolved: AnalyzedItem[]
    unresolved: AnalyzedItem[]
    error?: string
}

export async function analyzeBulkImport(items: ImportItem[]): Promise<ImportAnalysisResult> {
    const session = await auth()
    if (!session?.user?.id) return { success: false, resolved: [], unresolved: [], error: "Unauthorized" }
    const userId = session.user.id

    if (items.length > MAX_BULK_IMPORT_ITEMS) {
        return {
            success: false,
            resolved: [],
            unresolved: [],
            error: `최대 ${MAX_BULK_IMPORT_ITEMS}개까지 한 번에 등록할 수 있습니다.`,
        }
    }

    const resolvedItems: AnalyzedItem[] = []
    const unresolvedItems: AnalyzedItem[] = []

    // USD 종목 환율 자동 채움용 — 한 번만 호출.
    // 분석 단계에서는 lazy 하게 처음 USD 종목을 만났을 때 호출한다.
    let cachedUsdRate: number | null = null
    const ensureUsdRate = async (): Promise<number> => {
        if (cachedUsdRate !== null) return cachedUsdRate
        try {
            cachedUsdRate = await getUsdExchangeRate()
        } catch {
            cachedUsdRate = 0
        }
        return cachedUsdRate
    }

    try {
        for (const item of items) {
            const cleanIdentifier = item.identifier.trim()
            // Try explicit by code or name (EXACT match first)
            let stock = await prisma.stock.findFirst({
                where: {
                    OR: [
                        { stockCode: cleanIdentifier },
                        { stockName: cleanIdentifier }
                    ]
                }
            })

            // If not found in Stock, try to match by partial name or stripped whitespace name
            if (!stock) {
                // Try finding in Stock with whitespace removed (e.g. "LG 디스플레이" vs "LG디스플레이")
                // Prisma doesn't support regex replace in query easily, so we fallback to contains if short enough, or exact match variants.
                // Actually, let's just use contains for name in Stock first before going to master
                stock = await prisma.stock.findFirst({
                    where: {
                        stockName: { contains: cleanIdentifier }
                    }
                })
            }

            if (!stock) {
                // Check Master (ONLY FOR KOREAN STOCKS - 6 digits OR Korean characters)
                // If it looks like a KR identifier (6 digits) OR contains Hangul
                if (/^\d{6}$/.test(cleanIdentifier) || /[가-힣]/.test(cleanIdentifier) || (cleanIdentifier.toUpperCase() === cleanIdentifier && !/^[A-Z0-9]+$/.test(cleanIdentifier))) {
                    // For Master search, we want to be generous
                    const master = await prisma.kisStockMaster.findFirst({
                        where: {
                            OR: [
                                { stockCode: cleanIdentifier },
                                { stockName: cleanIdentifier },
                                { stockName: { contains: cleanIdentifier } },  // e.g. "LG디스플" -> "LG디스플레이"
                                { stockName: { startsWith: cleanIdentifier } }
                            ]
                        }
                    })

                    if (master) {
                        // Check if actually exists in Stock by code
                        stock = await prisma.stock.findUnique({ where: { stockCode: master.stockCode } })

                        // If not in Stock but in Master, we consider it 'resolved' (will be created on execute)
                        if (!stock) {
                            // Virtual stock object for UI display
                            stock = {
                                id: 'pending-creation',
                                stockCode: master.stockCode,
                                stockName: master.stockName,
                                market: master.market
                            } as any
                        }
                    }
                }

                // US Fallback
                if (!stock && /^[A-Z]{1,5}$/i.test(cleanIdentifier)) {
                    // ... US logic ...
                    // If not in DB and looks like US stock, Create "Virtual" US Stock
                    // PROVISIONAL: We assume it's a valid US ticker if it matches the pattern
                    // In a real app, we'd verify against a US api.
                    stock = {
                        id: 'pending-creation-us', // Special ID to note it's US
                        stockCode: item.identifier.toUpperCase(),
                        stockName: item.identifier.toUpperCase(), // Temporary Name
                        market: 'Unknown'
                    } as any
                }
            }

            if (stock) {
                // Enhance: If stock exists but market is Unknown, check Master (KR Only logic)
                let market = stock.market
                if ((market === 'Unknown' || !market) && /^\d{6}$/.test(stock.stockCode)) {
                    const master = await prisma.kisStockMaster.findUnique({ where: { stockCode: stock.stockCode } })
                    if (master) {
                        market = master.market
                        // We will update this in execute phase, but for prediction let's use it
                    }
                }

                // Check current holding — Phase A 이후 unique key 는 [accountId, stockId].
                // 분석 단계에서는 "이 사용자가 어디든 보유 중인 가장 최근 행"을 보여 주는 것으로 충분하다.
                // (정확한 충돌 판정은 execute 단계에서 선택된 accountId 와 함께 다시 확인한다.)
                let currentQty = 0
                let currentPrice = 0

                if (stock.id !== 'pending-creation' && stock.id !== 'pending-creation-us') {
                    const holding = await prisma.holding.findFirst({
                        where: { userId, stockId: stock.id },
                        orderBy: { updatedAt: 'desc' },
                    })
                    if (holding) {
                        currentQty = holding.quantity
                        currentPrice = Number(holding.averagePrice)
                    }
                }

                const currency = getCurrencyForMarket(market, stock.stockCode)

                // 환율 처리 — USD 종목만 의미 있음.
                let inputRate: number | undefined
                let effectiveRate: number | undefined
                let rateAutoFilled = false
                if (currency === 'USD') {
                    if (typeof item.purchaseRate === 'number' && item.purchaseRate > 0) {
                        inputRate = item.purchaseRate
                        effectiveRate = item.purchaseRate
                    } else {
                        const rate = await ensureUsdRate()
                        if (rate > 0) {
                            effectiveRate = rate
                            rateAutoFilled = true
                        }
                    }
                }

                resolvedItems.push({
                    identifier: item.identifier,
                    stockId: stock.id,
                    stockName: stock.stockName,
                    stockCode: stock.stockCode,
                    market: market ?? undefined,
                    currency,
                    inputQty: item.quantity,
                    inputPrice: item.averagePrice,
                    inputRate,
                    effectiveRate,
                    rateAutoFilled,
                    currentQty,
                    currentPrice,
                    status: 'resolved'
                })
            } else {
                unresolvedItems.push({
                    identifier: item.identifier,
                    inputQty: item.quantity,
                    inputPrice: item.averagePrice,
                    currentQty: 0,
                    currentPrice: 0,
                    status: 'unresolved'
                })
            }
        }

        return { success: true, resolved: resolvedItems, unresolved: unresolvedItems }

    } catch (error) {
        console.error("Analysis failed:", error)
        return { success: false, resolved: [], unresolved: [], error: "Analysis failed" }
    }
}


export async function executeBulkImport(
    items: { identifier: string, quantity: number, averagePrice: number, purchaseRate?: number }[], // Identifier here should be Valid Stock Code
    strategy: 'overwrite' | 'add',
    accountId: string,
) {
    const session = await auth()
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    if (!accountId) {
        return { success: false, error: '계좌를 선택해주세요.' }
    }

    if (items.length === 0) {
        return { success: false, error: '등록할 항목이 없습니다.' }
    }

    if (items.length > MAX_BULK_IMPORT_ITEMS) {
        return { success: false, error: `최대 ${MAX_BULK_IMPORT_ITEMS}개까지 한 번에 등록할 수 있습니다.` }
    }

    // Rate limiting — 일괄 등록은 비용 큰 트랜잭션. AI/시뮬레이션과 같은 등급의 보호.
    try {
        const h = await headers()
        const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'anonymous'
        const rl = await checkRateLimit(ratelimit.simulation, `bulk-import:${userId}:${ip}`)
        if (rl && !rl.success) {
            return { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
        }
    } catch {
        // fail-open
    }

    // IDOR 방어 — accountId 가 본인 소유인지 확인 (lib/auth-helpers 단일 진실).
    const ownedAccount = await assertAccountOwnership(accountId, userId)
    if (!ownedAccount) {
        return { success: false, error: 'Forbidden' }
    }

    // USD 종목 환율 자동 채움용 — purchaseRate 미입력 시에만 fetch.
    let cachedUsdRate: number | null = null
    const ensureUsdRate = async (): Promise<number> => {
        if (cachedUsdRate !== null) return cachedUsdRate
        try {
            cachedUsdRate = await getUsdExchangeRate()
        } catch {
            cachedUsdRate = 0
        }
        return cachedUsdRate
    }

    try {
        // 전체 import를 단일 트랜잭션으로 실행 - 중간에 실패하면 전체 롤백
        const result = await prisma.$transaction(async (tx) => {
            let successCount = 0
            const errors: { identifier: string; message: string }[] = []

            for (const item of items) {
                // 1. Final Resolve (Should be robust now)
                let stock = await tx.stock.findUnique({ where: { stockCode: item.identifier } })

                if (!stock) {
                    // Try User Creation for US stocks explicitly
                    if (/^[A-Z]{1,5}$/i.test(item.identifier)) {
                        stock = await tx.stock.create({
                            data: {
                                stockCode: item.identifier.toUpperCase(),
                                stockName: item.identifier.toUpperCase(),
                                market: 'NAS',
                                sector: 'Unknown'
                            }
                        })
                    } else {
                        // KOREAN Logic
                        const master = await tx.kisStockMaster.findUnique({ where: { stockCode: item.identifier } })
                        if (master) {
                            stock = await tx.stock.create({
                                data: {
                                    stockCode: master.stockCode,
                                    stockName: master.stockName,
                                    market: master.market,
                                    sector: 'Unknown'
                                }
                            })
                        }
                    }
                }

                if (!stock) {
                    // Soft failure: 종목을 식별할 수 없는 항목은 스킵 (트랜잭션은 유지)
                    errors.push({ identifier: item.identifier, message: "Stock not found" })
                    continue
                }

                // Self-Healing (KR Only)
                let market = stock.market
                if ((market === 'Unknown' || !market) && /^\d{6}$/.test(stock.stockCode)) {
                    const master = await tx.kisStockMaster.findUnique({ where: { stockCode: stock.stockCode } })
                    if (master) {
                        market = master.market
                        await tx.stock.update({
                            where: { id: stock.id },
                            data: { market: master.market }
                        })
                    }
                }

                const currency = getCurrencyForMarket(market, stock.stockCode)

                // 환율 결정 — USD 면 입력값 또는 자동 채움, KRW 면 1.
                let purchaseRate = 1
                if (currency === 'USD') {
                    if (typeof item.purchaseRate === 'number' && item.purchaseRate > 0) {
                        purchaseRate = item.purchaseRate
                    } else {
                        const rate = await ensureUsdRate()
                        purchaseRate = rate > 0 ? rate : 1
                    }
                }

                // 2. Logic based on Strategy
                if (strategy === 'overwrite') {
                    await tx.holding.upsert({
                        where: { accountId_stockId: { accountId, stockId: stock.id } },
                        update: {
                            quantity: item.quantity,
                            averagePrice: item.averagePrice,
                            currency,
                            purchaseRate,
                        },
                        create: {
                            userId,
                            accountId,
                            stockId: stock.id,
                            quantity: item.quantity,
                            averagePrice: item.averagePrice,
                            currency,
                            purchaseRate,
                        }
                    })
                } else { // 'add'
                    const existing = await tx.holding.findUnique({
                        where: { accountId_stockId: { accountId, stockId: stock.id } }
                    })

                    if (existing) {
                        // Weighted Average — Decimal 사용. 누적 부동소수점 오차가 평단가에 영구히 누적되는 것을 막는다.
                        // 환율도 가중평균으로 합산(USD 종목만 의미).
                        const totalQty = existing.quantity + item.quantity
                        const oldTotalVal = new Decimal(existing.averagePrice.toString()).times(existing.quantity)
                        const newTotalVal = new Decimal(item.averagePrice).times(item.quantity)
                        const newAvgPrice = totalQty > 0
                            ? oldTotalVal.plus(newTotalVal).div(totalQty)
                            : new Decimal(0)

                        let newPurchaseRate = existing.purchaseRate
                        if (currency === 'USD' && totalQty > 0) {
                            const oldRateTotal = new Decimal(existing.purchaseRate.toString()).times(existing.quantity)
                            const newRateTotal = new Decimal(purchaseRate).times(item.quantity)
                            newPurchaseRate = oldRateTotal.plus(newRateTotal).div(totalQty) as unknown as typeof existing.purchaseRate
                        }

                        await tx.holding.update({
                            where: { accountId_stockId: { accountId, stockId: stock.id } },
                            data: {
                                quantity: totalQty,
                                averagePrice: newAvgPrice,
                                currency,
                                purchaseRate: newPurchaseRate,
                            }
                        })
                    } else {
                        await tx.holding.create({
                            data: {
                                userId,
                                accountId,
                                stockId: stock.id,
                                quantity: item.quantity,
                                averagePrice: item.averagePrice,
                                currency,
                                purchaseRate,
                            }
                        })
                    }
                }
                successCount++
            }

            return { successCount, errors }
        }, {
            // 대량 import의 경우 기본 5초로는 부족할 수 있음
            timeout: 30000,
            maxWait: 10000,
        })

        await holdingService.invalidate(userId)
        revalidatePath('/dashboard')
        return { success: true, count: result.successCount, errors: result.errors }

    } catch (error) {
        // 트랜잭션 내부에서 throw된 모든 에러는 전체 롤백을 유발 - 부분 적용 방지
        console.error("Bulk import transaction failed - rolled back:", error)
        return { success: false, error: "Execution failed - transaction rolled back" }
    }
}
