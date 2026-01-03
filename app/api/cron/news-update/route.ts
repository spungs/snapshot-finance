import { NextRequest, NextResponse } from 'next/server'
import { getBigTechNews } from '@/actions/news'

// Allow up to 5 minutes for execution (for AI filtering/summarizing)
export const maxDuration = 300

const BIG_TECH_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META']

export async function GET(request: NextRequest) {
    // 1. Authentication
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const results = []

        for (const symbol of BIG_TECH_SYMBOLS) {
            try {
                // Ensure we wait a bit between requests if needed, 
                // but getBigTechNews already has a 2s delay inside when fetching.
                console.log(`[Cron] Updating news for ${symbol}...`)

                // This function handles: Check DB -> Fetch API -> Summarize -> Save
                // It returns the news items.
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
