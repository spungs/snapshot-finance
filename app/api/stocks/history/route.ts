import { NextRequest, NextResponse } from 'next/server'
import { kisClient } from '@/lib/api/kis-client'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const symbol = searchParams.get('symbol')
        const market = searchParams.get('market') as 'KOSPI' | 'KOSDAQ' | 'US' | 'FX'
        const date = searchParams.get('date')

        if (!symbol || !market || !date) {
            return NextResponse.json(
                { success: false, error: { message: 'Missing required parameters' } },
                { status: 400 }
            )
        }

        // Special handling for FX (Exchange Rate)
        if (market === 'FX') {
            // Use 'US' logic in kisClient which uses Yahoo Finance, valid for tickers like "KRW=X"
            const result = await kisClient.getDailyPrice(symbol, 'US', date)
            return NextResponse.json({ success: true, data: result })
        }

        const result = await kisClient.getDailyPrice(symbol, market, date)

        if (!result) {
            return NextResponse.json(
                { success: false, error: { message: 'No data found for this date' } },
                { status: 404 }
            )
        }

        return NextResponse.json({ success: true, data: result })
    } catch (error) {
        console.error('Historical price fetch error:', error)
        return NextResponse.json(
            { success: false, error: { message: 'Failed to fetch historical price' } },
            { status: 500 }
        )
    }
}
