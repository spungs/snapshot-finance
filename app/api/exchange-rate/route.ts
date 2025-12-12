import { NextResponse } from 'next/server'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const rate = await getUsdExchangeRate()
        return NextResponse.json({ success: true, rate })
    } catch (error) {
        return NextResponse.json(
            { success: false, error: 'Failed to fetch exchange rate' },
            { status: 500 }
        )
    }
}
