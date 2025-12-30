import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { auth } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

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
            where: {
                id: snapshotId,
                userId: session.user.id // Ensure ownership
            },
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

        // Fetch custom exchange rate (Real-time)
        const currentExchangeRateData = await getUsdExchangeRate()
        const currentExchangeRate = currentExchangeRateData

        const snapshotExchangeRate = Number((snapshot as any).exchangeRate) || 1

        // 2. Fetch current prices for all holdings in parallel
        const simulationResults = await Promise.all(
            snapshot.holdings.map(async (holding: any) => {
                try {
                    // Determine market and currency
                    const market = holding.stock.market === 'KOSPI' || holding.stock.market === 'KOSDAQ'
                        ? holding.stock.market
                        : (isNaN(Number(holding.stock.stockCode)) ? 'US' : 'KOSPI')

                    const isUsd = holding.currency === 'USD' || market === 'US'
                    const appliedRate = isUsd ? currentExchangeRate : 1

                    const priceData = await kisClient.getCurrentPrice(holding.stock.stockCode, market as any)

                    const currentPriceNative = priceData.price
                    const snapshotPriceNative = Number(holding.averagePrice) // Use Average Price (Cost)

                    const purchaseRate = Number(holding.purchaseRate) || 1

                    // Determine Cost Basis Rate
                    // User Request: Use Snapshot Time Exchange Rate.
                    // We interpret this as forcing the calculation to use the exchange rate stored in the snapshot.
                    let costBasisRate = 1
                    if (isUsd) {
                        costBasisRate = snapshotExchangeRate
                    }

                    const quantity = Number(holding.quantity)

                    // Native calculations for display
                    const simulatedValueNative = currentPriceNative * quantity
                    const originalValueNative = snapshotPriceNative * quantity

                    // KRW calculations for total summary
                    // Simulated (Current) Value using Current Exchange Rate
                    const simulatedValueKRW = simulatedValueNative * appliedRate

                    // Original (Cost) Value using Purchase Rate (or Snapshot Rate fallback)
                    const originalValueKRW = originalValueNative * costBasisRate

                    const gainKRW = simulatedValueKRW - originalValueKRW
                    const gainRateKRW = originalValueKRW > 0 ? ((simulatedValueKRW - originalValueKRW) / originalValueKRW) * 100 : 0

                    return {
                        stockName: holding.stock.stockName,
                        stockCode: holding.stock.stockCode,
                        quantity: quantity,
                        currency: isUsd ? 'USD' : 'KRW',

                        // Detail View: Native Currency
                        snapshotPrice: snapshotPriceNative, // Average Price
                        currentPrice: currentPriceNative,
                        originalValue: originalValueNative,
                        simulatedValue: simulatedValueNative,
                        gain: simulatedValueNative - originalValueNative,
                        gainRate: originalValueNative > 0 ? ((simulatedValueNative - originalValueNative) / originalValueNative) * 100 : 0,

                        // Fields for aggregation
                        originalValueKRW,
                        simulatedValueKRW,
                        gainKRW,
                        gainRateKRW
                    }
                } catch (error) {
                    console.error(`Failed to simulate ${holding.stock.stockName}:`, error)
                    return {
                        stockName: holding.stock.stockName,
                        stockCode: holding.stock.stockCode,
                        quantity: Number(holding.quantity),
                        error: 'Failed to fetch price',
                        currency: 'KRW',
                        currentPrice: 0,
                        snapshotPrice: 0,
                        simulatedValue: 0,
                        originalValue: 0,
                        gain: 0,
                        gainRate: 0,
                        originalValueKRW: 0,
                        simulatedValueKRW: 0
                    }
                }
            })
        )

        // 3. Aggregate results (using KRW values for total)
        const totalOriginalValue = simulationResults.reduce((sum, item) => sum + (item.originalValueKRW || 0), 0)
        const totalSimulatedValue = simulationResults.reduce((sum, item) => sum + (item.simulatedValueKRW || 0), 0)
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
                holdings: simulationResults, // Items contain native values + hidden KRW values
                exchangeRate: currentExchangeRate,
                snapshotExchangeRate,
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
