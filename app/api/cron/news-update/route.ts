import { NextRequest, NextResponse } from 'next/server'
import { getStockNews } from '@/actions/news'
import { M7_SYMBOLS, isLikelyEtf } from '@/lib/news/m7'
import { prisma } from '@/lib/prisma'

// Allow up to 5 minutes for execution (safety net, though we aim for <10s per symbol)
export const maxDuration = 300

const US_MARKETS = ['US', 'NAS', 'NYS', 'AMS']

interface TargetStock {
    symbol: string
    keywords?: string[]
}

async function getTargetStocks(): Promise<TargetStock[]> {
    const heldUsStocks = await prisma.stock.findMany({
        where: {
            market: { in: US_MARKETS },
            liveHoldings: { some: {} },
        },
        select: { stockCode: true, stockName: true, engName: true },
    })

    const map = new Map<string, TargetStock>()
    for (const stock of heldUsStocks) {
        if (isLikelyEtf(stock.stockName, stock.engName)) continue
        map.set(stock.stockCode, {
            symbol: stock.stockCode,
            keywords: stock.engName ? [stock.engName, stock.stockCode] : undefined,
        })
    }
    for (const symbol of M7_SYMBOLS) {
        if (!map.has(symbol)) map.set(symbol, { symbol })
    }
    return Array.from(map.values())
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(request.url)
        const symbolParam = searchParams.get('symbol')

        const targets = await getTargetStocks()
        const targetMap = new Map(targets.map(t => [t.symbol, t]))

        // Mode 1: Single Symbol Update (Optimized for Cron Fan-out)
        if (symbolParam) {
            const target = targetMap.get(symbolParam)
            if (!target) {
                return NextResponse.json({ success: false, error: 'Invalid or unheld symbol' }, { status: 400 })
            }

            console.log(`[Cron] Specific update triggered for ${symbolParam}`)
            const startTime = Date.now()

            try {
                const news = await getStockNews(target.symbol, target.keywords)
                const duration = (Date.now() - startTime) / 1000
                console.log(`[Cron] ${symbolParam} update complete in ${duration}s`)

                return NextResponse.json({
                    success: true,
                    symbol: symbolParam,
                    count: news.length,
                    duration: `${duration}s`,
                })
            } catch (error) {
                console.error(`[Cron] Failed specific update for ${symbolParam}:`, error)
                return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
            }
        }

        // Mode 2: Update All (Legacy/Fallback)
        const results = []
        console.log(`[Cron] Updating all symbols (${targets.length} total)...`)

        for (const target of targets) {
            try {
                console.log(`[Cron] Updating news for ${target.symbol}...`)
                const news = await getStockNews(target.symbol, target.keywords)
                results.push({ symbol: target.symbol, count: news.length, status: 'updated' })
            } catch (error) {
                console.error(`[Cron] Failed to update ${target.symbol}:`, error)
                results.push({ symbol: target.symbol, status: 'failed', error: String(error) })
            }
        }

        return NextResponse.json({ success: true, results })
    } catch (error) {
        console.error('[News Cron] Job failed:', error)
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}
