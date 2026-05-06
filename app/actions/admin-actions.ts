'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { holdingService } from '@/lib/services/holding-service'

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
// New Types
// ----------------------------------------------------------------------
export type ImportItem = {
    identifier: string
    quantity: number
    averagePrice: number
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

    const resolvedItems: AnalyzedItem[] = []
    const unresolvedItems: AnalyzedItem[] = []

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

                // Check current holding
                let currentQty = 0
                let currentPrice = 0

                if (stock.id !== 'pending-creation' && stock.id !== 'pending-creation-us') {
                    const holding = await prisma.holding.findUnique({
                        where: {
                            userId_stockId: { userId, stockId: stock.id }
                        }
                    })
                    if (holding) {
                        currentQty = holding.quantity
                        currentPrice = Number(holding.averagePrice)
                    }
                }

                const currency = getCurrencyForMarket(market, stock.stockCode)

                resolvedItems.push({
                    identifier: item.identifier,
                    stockId: stock.id,
                    stockName: stock.stockName,
                    stockCode: stock.stockCode,
                    market: market ?? undefined,
                    currency,
                    inputQty: item.quantity,
                    inputPrice: item.averagePrice,
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
    items: { identifier: string, quantity: number, averagePrice: number }[], // Identifier here should be Valid Stock Code
    strategy: 'overwrite' | 'add'
) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }
    const userId = session.user.id

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

                // 2. Logic based on Strategy
                if (strategy === 'overwrite') {
                    await tx.holding.upsert({
                        where: { userId_stockId: { userId, stockId: stock.id } },
                        update: {
                            quantity: item.quantity,
                            averagePrice: item.averagePrice,
                            currency,
                        },
                        create: {
                            userId,
                            stockId: stock.id,
                            quantity: item.quantity,
                            averagePrice: item.averagePrice,
                            currency,
                        }
                    })
                } else { // 'add'
                    const existing = await tx.holding.findUnique({
                        where: { userId_stockId: { userId, stockId: stock.id } }
                    })

                    if (existing) {
                        // Weighted Average Price Calculation
                        const totalQty = existing.quantity + item.quantity
                        const oldTotalVal = Number(existing.averagePrice) * existing.quantity
                        const newTotalVal = item.averagePrice * item.quantity
                        const newAvgPrice = (oldTotalVal + newTotalVal) / totalQty

                        await tx.holding.update({
                            where: { userId_stockId: { userId, stockId: stock.id } },
                            data: {
                                quantity: totalQty,
                                averagePrice: newAvgPrice,
                                currency,
                            }
                        })
                    } else {
                        await tx.holding.create({
                            data: {
                                userId,
                                stockId: stock.id,
                                quantity: item.quantity,
                                averagePrice: item.averagePrice,
                                currency,
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
