import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { snapshotId } = body

        if (!snapshotId) {
            return NextResponse.json(
                { success: false, error: 'Snapshot ID is required' },
                { status: 400 }
            )
        }

        // 1. Fetch snapshot with holdings and stock info
        const snapshot = await prisma.portfolioSnapshot.findUnique({
            where: { id: snapshotId },
            include: {
                holdings: {
                    include: {
                        stock: true,
                    },
                },
            },
        })

        if (!snapshot) {
            return NextResponse.json(
                { success: false, error: 'Snapshot not found' },
                { status: 404 }
            )
        }

        // 2. Fetch current prices for all holdings in parallel
        const simulationResults = await Promise.all(
            snapshot.holdings.map(async (holding: any) => {
                try {
                    // Determine market. If not in DB, infer from code.
                    // Ideally we should store market in Stock table.
                    // For now, use the same heuristic: numeric = KOSPI/KOSDAQ (default KOSPI), alpha = US
                    const market = holding.stock.market === 'KOSPI' || holding.stock.market === 'KOSDAQ'
                        ? holding.stock.market
                        : (isNaN(Number(holding.stock.stockCode)) ? 'US' : 'KOSPI')

                    const priceData = await kisClient.getCurrentPrice(holding.stock.stockCode, market as any)

                    const currentPrice = priceData.price
                    const quantity = Number(holding.quantity)
                    const simulatedValue = currentPrice * quantity
                    const originalValue = Number(holding.totalValue) // Value at snapshot time

                    return {
                        stockName: holding.stock.stockName,
                        stockCode: holding.stock.stockCode,
                        quantity: quantity,
                        originalPrice: Number(holding.averagePrice), // Or currentPrice at snapshot time? averagePrice is cost basis.
                        // Actually, for "if I held on", we compare "Value at Snapshot" vs "Value Now".
                        // But usually users want to know "If I held on from my original purchase".
                        // Let's compare against the Snapshot's value.
                        snapshotPrice: Number(holding.currentPrice), // Price AT THE TIME of snapshot
                        currentPrice: currentPrice,
                        originalValue: Number(holding.currentPrice) * quantity, // Value at snapshot time
                        simulatedValue: simulatedValue,
                        gain: simulatedValue - (Number(holding.currentPrice) * quantity),
                        gainRate: ((simulatedValue - (Number(holding.currentPrice) * quantity)) / (Number(holding.currentPrice) * quantity)) * 100,
                    }
                } catch (error) {
                    console.error(`Failed to simulate ${holding.stock.stockName}:`, error)
                    return {
                        stockName: holding.stock.stockName,
                        stockCode: holding.stock.stockCode,
                        quantity: Number(holding.quantity),
                        error: 'Failed to fetch price',
                        currentPrice: 0,
                        simulatedValue: 0,
                        originalValue: 0,
                        gain: 0,
                        gainRate: 0,
                    }
                }
            })
        )

        // 3. Aggregate results
        const totalOriginalValue = simulationResults.reduce((sum, item) => sum + (item.originalValue || 0), 0)
        const totalSimulatedValue = simulationResults.reduce((sum, item) => sum + (item.simulatedValue || 0), 0)
        const totalGain = totalSimulatedValue - totalOriginalValue
        const totalGainRate = totalOriginalValue > 0 ? (totalGain / totalOriginalValue) * 100 : 0

        return NextResponse.json({
            success: true,
            data: {
                snapshotDate: snapshot.snapshotDate,
                totalOriginalValue,
                totalSimulatedValue,
                totalGain,
                totalGainRate,
                holdings: simulationResults,
            },
        })

    } catch (error) {
        console.error('Simulation error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to run simulation' },
            { status: 500 }
        )
    }
}
