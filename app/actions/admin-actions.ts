'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function updateCashBalance(amount: number) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { cashBalance: amount }
        })
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error("Failed to update cash:", error)
        return { success: false, error: "Database error" }
    }
}

export async function bulkImportHoldings(items: { identifier: string, quantity: number, averagePrice: number }[]) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    const userId = session.user.id
    const errors: { identifier: string, message: string }[] = []
    let successCount = 0

    try {
        // We will process sequentially to avoid race conditions on creating Stocks
        for (const item of items) {
            try {
                // 1. Resolve Stock
                let stock = await prisma.stock.findFirst({
                    where: {
                        OR: [
                            { stockCode: item.identifier },
                            { stockName: item.identifier }
                        ]
                    }
                })

                // If not found in Stock table, check Master table
                if (!stock) {
                    const master = await prisma.kisStockMaster.findFirst({
                        where: {
                            OR: [
                                { stockCode: item.identifier },
                                { stockName: item.identifier },
                                { stockName: { contains: item.identifier } } // Simple fuzzy search
                            ]
                        }
                    })

                    if (master) {
                        // Check if stock exists by code from master (in case we found master by name)
                        stock = await prisma.stock.findUnique({
                            where: { stockCode: master.stockCode }
                        })

                        if (!stock) {
                            // Create Stock from Master
                            stock = await prisma.stock.create({
                                data: {
                                    stockCode: master.stockCode,
                                    stockName: master.stockName,
                                    market: master.market,
                                    sector: 'Unknown' // Master doesn't have sector?
                                }
                            })
                        }
                    }
                }

                if (!stock) {
                    errors.push({ identifier: item.identifier, message: "Stock not found" })
                    continue
                }

                // 2. Upsert Holding
                // Check if holding exists to preserve other fields if needed, or just upsert
                await prisma.holding.upsert({
                    where: {
                        userId_stockId: {
                            userId: userId,
                            stockId: stock.id
                        }
                    },
                    update: {
                        quantity: { increment: item.quantity }, // User asked for "Setup", usually implies "Set". But my dialog said "Add". 
                        // Wait, "Add" is safer. But if they want to "Set", they should clear first.
                        // Let's stick to "Set" logic?
                        // "Append" was the default in my plan.
                        // "Easily input and push" -> "Add" is logical.
                        // But if I paste "Samsung 10", then paste "Samsung 10" again, do I have 20? 
                        // Usually "Migration" means "Set". 
                        // Let's DO "Set" (Overwrite quantity) if it's a "Setup" feature.
                        // Actually, let's just Upsert with SET quantity for now as it's cleaner for "Importing Snapshot".
                        quantity: item.quantity,
                        averagePrice: item.averagePrice,
                    },
                    create: {
                        userId: userId,
                        stockId: stock.id,
                        quantity: item.quantity,
                        averagePrice: item.averagePrice,
                        currency: stock.market === 'NAS' || stock.market === 'NYS' || stock.market === 'AMS' ? 'USD' : 'KRW', // Simple heuristic
                    }
                })
                successCount++

            } catch (innerError) {
                console.error(`Failed to import ${item.identifier}:`, innerError)
                errors.push({ identifier: item.identifier, message: "Database error" })
            }
        }

        revalidatePath('/dashboard')
        return { success: true, count: successCount, errors: errors.length > 0 ? errors : undefined }

    } catch (error) {
        console.error("Bulk import failed:", error)
        return { success: false, error: "Bulk import failed" }
    }
}
