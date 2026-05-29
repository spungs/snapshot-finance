'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { holdingService } from '@/lib/services/holding-service'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'
import { assertAccountOwnership } from '@/lib/auth-helpers'
import { resolveOrCreateStock } from '@/lib/services/stock-resolver'
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
        const US_MARKETS = ['NAS', 'NYS', 'AMS', 'NASD', 'NYSE', 'AMEX']
        if (US_MARKETS.includes(cleanMarket)) return 'USD'
        // LSE 종목은 USD-표시 라인만 지원 (stooq/Twelve Data USD). GBP/GBX 미지원.
        if (cleanMarket === 'LSE') return 'USD'
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
            // stockCode/nameEn 정확 → nameKo → LSE(Twelve Data) 동적 등록까지 일괄 처리.
            // resolveOrCreateStock 이 1·2단계(KIS 마스터) + 3단계(LSE upsert)를 모두 수행.
            // 반환된 부분 select(stockCode/nameKo/nameEn/market)에 이후 사용 필드가 모두 있어 재조회 불필요.
            // 주의: LSE 미등록 종목은 여기서 stocks 에 upsert 됨 — executeBulkImport 의 stock lookup 이
            // 성공하려면 분석 단계의 이 선등록이 전제 (KIS 마스터 사전 등록과 동일 철학).
            const stock = await resolveOrCreateStock(cleanIdentifier)

            if (stock) {
                const market = stock.market

                // Check current holding — stockCode 단위로 사용자 보유 row 확인.
                let currentQty = 0
                let currentPrice = 0

                const holding = await prisma.holding.findFirst({
                    where: { userId, stockCode: stock.stockCode },
                    orderBy: { updatedAt: 'desc' },
                })
                if (holding) {
                    currentQty = holding.quantity
                    currentPrice = Number(holding.averagePrice)
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
                    stockCode: stock.stockCode,
                    stockName: stock.nameKo,
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
                // stocks 통합 후: 마스터 lookup 한 번이면 충분. 없으면 unresolved.
                const stock = await tx.stock.findUnique({ where: { stockCode: item.identifier } })

                if (!stock) {
                    // Soft failure: 종목을 식별할 수 없는 항목은 스킵 (트랜잭션은 유지)
                    errors.push({ identifier: item.identifier, message: "Stock not found" })
                    continue
                }

                const market = stock.market

                const currency = getCurrencyForMarket(market, stock.stockCode)

                // 기존 보유 조회 — 환율 결정 + 가중평균 계산에 공통으로 사용.
                const existing = await tx.holding.findUnique({
                    where: { accountId_stockCode: { accountId, stockCode: stock.stockCode } }
                })

                // 환율 결정 — USD 종목만 의미.
                // 우선순위:
                //  1) 사용자 명시 입력 (item.purchaseRate)
                //  2) 기존 보유의 매입환율 (기존 정보 보존, 덮어쓰기 방지)
                //  3) 현재 환율 (신규 종목 fallback)
                let purchaseRate = 1
                if (currency === 'USD') {
                    if (typeof item.purchaseRate === 'number' && item.purchaseRate > 0) {
                        purchaseRate = item.purchaseRate
                    } else if (existing) {
                        purchaseRate = Number(existing.purchaseRate)
                    } else {
                        const rate = await ensureUsdRate()
                        purchaseRate = rate > 0 ? rate : 1
                    }
                }

                // 2. Logic based on Strategy
                if (strategy === 'overwrite') {
                    await tx.holding.upsert({
                        where: { accountId_stockCode: { accountId, stockCode: stock.stockCode } },
                        update: {
                            quantity: item.quantity,
                            averagePrice: item.averagePrice,
                            currency,
                            purchaseRate,
                        },
                        create: {
                            userId,
                            accountId,
                            stockCode: stock.stockCode,
                            quantity: item.quantity,
                            averagePrice: item.averagePrice,
                            currency,
                            purchaseRate,
                        }
                    })
                } else { // 'add'
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
                            where: { accountId_stockCode: { accountId, stockCode: stock.stockCode } },
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
                                stockCode: stock.stockCode,
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
