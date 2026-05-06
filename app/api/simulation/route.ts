import { NextRequest, NextResponse } from 'next/server'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/prisma'
import { kisClient } from '@/lib/api/kis-client'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { auth } from '@/lib/auth'
import { ratelimit, getIP, checkRateLimit } from '@/lib/ratelimit'

export async function POST(request: NextRequest) {
    try {
        // Rate limiting (외부 API 다수 호출하므로 엄격하게 제한)
        const ip = getIP(request)
        const rateLimitResult = await checkRateLimit(ratelimit.simulation, ip)

        if (rateLimitResult && !rateLimitResult.success) {
            return NextResponse.json(
                { success: false, error: { code: 'RATE_LIMIT', message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' } },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Reset': rateLimitResult.reset.toString(),
                    }
                }
            )
        }

        // 인증 확인
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { snapshotId } = body

        if (!snapshotId) {
            return NextResponse.json(
                { success: false, error: 'Snapshot ID is required' },
                { status: 400 }
            )
        }

        // 1. Fetch snapshot with holdings and stock info (소유권 검사 포함)
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

        // 스냅샷이 없거나 본인 소유가 아닌 경우
        if (!snapshot || snapshot.userId !== session.user.id) {
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

                    const currentPrice = new Decimal(priceData.price)
                    const snapshotPrice = new Decimal(holding.averagePrice as any) // Use Average Price (Cost)

                    // Determine Cost Basis Rate
                    // User Request: Use Snapshot Time Exchange Rate.
                    // We interpret this as forcing the calculation to use the exchange rate stored in the snapshot.
                    const costBasisRate = isUsd ? new Decimal(snapshotExchangeRate) : new Decimal(1)
                    const appliedRateDec = new Decimal(appliedRate)

                    const quantity = new Decimal(holding.quantity as any)

                    // Native calculations for display
                    const simulatedValueNative = currentPrice.times(quantity)
                    const originalValueNative = snapshotPrice.times(quantity)
                    const gainNative = simulatedValueNative.minus(originalValueNative)
                    const gainRateNative = originalValueNative.isZero()
                        ? new Decimal(0)
                        : gainNative.dividedBy(originalValueNative).times(100)

                    // KRW calculations for total summary
                    // Simulated (Current) Value using Current Exchange Rate
                    const simulatedValueKRW = simulatedValueNative.times(appliedRateDec)

                    // Original (Cost) Value using Purchase Rate (or Snapshot Rate fallback)
                    const originalValueKRW = originalValueNative.times(costBasisRate)

                    const gainKRW = simulatedValueKRW.minus(originalValueKRW)
                    const gainRateKRW = originalValueKRW.isZero()
                        ? new Decimal(0)
                        : gainKRW.dividedBy(originalValueKRW).times(100)

                    return {
                        stockName: holding.stock.stockName,
                        stockCode: holding.stock.stockCode,
                        quantity: quantity.toNumber(),
                        currency: isUsd ? 'USD' : 'KRW',

                        // Detail View: Native Currency
                        snapshotPrice: snapshotPrice.toNumber(), // Average Price
                        currentPrice: currentPrice.toNumber(),
                        originalValue: originalValueNative.toNumber(),
                        simulatedValue: simulatedValueNative.toNumber(),
                        gain: gainNative.toNumber(),
                        gainRate: gainRateNative.toNumber(),

                        // Fields for aggregation
                        originalValueKRW: originalValueKRW.toNumber(),
                        simulatedValueKRW: simulatedValueKRW.toNumber(),
                        gainKRW: gainKRW.toNumber(),
                        gainRateKRW: gainRateKRW.toNumber()
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
        const totalOriginalValueDec = simulationResults.reduce(
            (sum, item) => sum.plus(item.originalValueKRW || 0),
            new Decimal(0)
        )
        const totalSimulatedValueDec = simulationResults.reduce(
            (sum, item) => sum.plus(item.simulatedValueKRW || 0),
            new Decimal(0)
        )
        const totalGainDec = totalSimulatedValueDec.minus(totalOriginalValueDec)
        const totalGainRateDec = totalOriginalValueDec.isZero()
            ? new Decimal(0)
            : totalGainDec.dividedBy(totalOriginalValueDec).times(100)

        return NextResponse.json({
            success: true,
            data: {
                snapshotDate: snapshot.snapshotDate,
                totalOriginalValue: totalOriginalValueDec.toNumber(),
                totalSimulatedValue: totalSimulatedValueDec.toNumber(),
                totalGain: totalGainDec.toNumber(),
                totalGainRate: totalGainRateDec.toNumber(),
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
