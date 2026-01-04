import { NextRequest, NextResponse } from 'next/server'
import { getBigTechNews } from '@/actions/news'

// Allow up to 5 minutes for execution (safety net, though we aim for <10s per symbol)
export const maxDuration = 300

const BIG_TECH_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META']

export async function GET(request: NextRequest) {
    // 1. Authentication
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(request.url)
        const symbolParam = searchParams.get('symbol')

        // Mode 1: Single Symbol Update (Optimized for Cron Fan-out)
        if (symbolParam) {
            if (!BIG_TECH_SYMBOLS.includes(symbolParam)) {
                return NextResponse.json({ success: false, error: 'Invalid symbol' }, { status: 400 })
            }

            console.log(`[Cron] Specific update triggered for ${symbolParam}`)
            const startTime = Date.now()

            try {
                const news = await getBigTechNews(symbolParam)
                const duration = (Date.now() - startTime) / 1000
                console.log(`[Cron] ${symbolParam} update complete in ${duration}s`)

                return NextResponse.json({
                    success: true,
                    symbol: symbolParam,
                    count: news.length,
                    duration: `${duration}s`
                })
            } catch (error) {
                console.error(`[Cron] Failed specific update for ${symbolParam}:`, error)
                return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
            }
        }

        // Mode 2: Update All (Legacy/Fallback)
        // Note: This might timeout on Vercel Hobby if there are many new articles.
        const results = []
        console.log('[Cron] Updating all symbols (Legacy Mode)...')

        for (const symbol of BIG_TECH_SYMBOLS) {
            try {
                console.log(`[Cron] Updating news for ${symbol}...`)
                const news = await getBigTechNews(symbol)
                results.push({ symbol, count: news.length, status: 'updated' })
            } catch (error) {
                console.error(`[Cron] Failed to update ${symbol}:`, error)
                results.push({ symbol, status: 'failed', error: String(error) })
            }
        }

        return NextResponse.json({ success: true, results })
    } catch (error) {
        console.error('[News Cron] Job failed:', error)
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}
