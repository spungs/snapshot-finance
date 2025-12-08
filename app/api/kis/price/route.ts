import { NextRequest, NextResponse } from 'next/server'
import { kisClient } from '@/lib/api/kis-client'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const symbol = searchParams.get('symbol')
    const market = searchParams.get('market') as 'KOSPI' | 'KOSDAQ' | 'US' | null

    if (!symbol) {
        return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 })
    }

    try {
        // Default to KOSPI if market is not provided (or handle logic to detect market)
        // For now, client should send market.
        const priceData = await kisClient.getCurrentPrice(symbol, market || 'KOSPI')

        return NextResponse.json({ success: true, data: priceData })
    } catch (error: any) {
        console.error('Price fetch error:', error)
        return NextResponse.json(
            {
                success: false,
                error: `Price Fetch Failed: ${error.message || error}`,
                details: JSON.stringify(error, Object.getOwnPropertyNames(error))
            },
            { status: 500 }
        )
    }
}
