import { NextRequest, NextResponse } from 'next/server'
import { kisClient } from '@/lib/api/kis-client'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const symbol = searchParams.get('symbol')
        const market = searchParams.get('market') as 'KOSPI' | 'KOSDAQ' | 'US'
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')

        if (!symbol || !market || !startDate || !endDate) {
            return NextResponse.json(
                { success: false, error: { message: 'Missing required parameters' } },
                { status: 400 }
            )
        }

        console.log(`Fetching chart data for ${symbol} (${market}) from ${startDate} to ${endDate}`)
        const data = await kisClient.getDailyPriceRange(symbol, market, startDate, endDate)
        console.log(`Fetched ${data.length} data points for ${symbol}`)

        return NextResponse.json({ success: true, data })
    } catch (error) {
        console.error('Stock chart data fetch error:', error)
        return NextResponse.json(
            { success: false, error: { message: 'Failed to fetch stock chart data' } },
            { status: 500 }
        )
    }
}
