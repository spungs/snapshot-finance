'use server'

import { prisma } from '@/lib/prisma'
import { fetchCompanyNews } from '@/lib/news/fetcher'
import { summarizeNews } from '@/lib/ai/summarizer'
import { auth } from '@/lib/auth'
import { isLikelyEtf, type NewsStock } from '@/lib/news/m7'
import pLimit from 'p-limit'

// Limit concurrent AI requests to 3 to avoid rate limits (Gemini Free: 15 RPM)
const limit = pLimit(3)

const US_MARKETS = ['US', 'NAS', 'NYS', 'AMS']

export async function getStockNews(symbol: string, keywords?: string[]) {
    try {
        console.log(`[News] Starting update for ${symbol}...`)

        const freshNews = await fetchCompanyNews(symbol, keywords)

        if (freshNews.length === 0) {
            console.log(`[News] No news found for ${symbol}`)
            return await getCachedNews(symbol)
        }

        const urlsToCheck = freshNews.map(n => n.url)
        const existingArticles = await prisma.newsArticle.findMany({
            where: { url: { in: urlsToCheck } },
            select: { url: true }
        })

        const existingUrls = new Set(existingArticles.map(a => a.url))
        const newArticles = freshNews.filter(item => !existingUrls.has(item.url))

        console.log(`[News] ${symbol}: Found ${freshNews.length} items, ${newArticles.length} are new.`)

        const processPromises = newArticles.map(item =>
            limit(async () => {
                try {
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 1000))

                    let summaries = null
                    try {
                        summaries = await summarizeNews(item.title, item.originalSummary, item.source)
                    } catch (aiError) {
                        console.warn(`[News] AI Summary failed for ${item.symbol}, saving without summary. Error: ${aiError}`)
                    }

                    await prisma.newsArticle.create({
                        data: {
                            symbol,
                            title: item.title,
                            url: item.url,
                            publishedAt: item.publishedAt,
                            source: item.source,
                            imageUrl: item.imageUrl,
                            summaryShort: summaries?.short || item.originalSummary,
                            summaryMedium: summaries?.medium || item.originalSummary,
                            summaryLong: summaries?.long || item.originalSummary
                        }
                    })
                    return { status: 'success', url: item.url, hasSummary: !!summaries }
                } catch (error) {
                    console.error(`[News] Error processing article ${item.url}:`, error)
                    return { status: 'error', url: item.url, error }
                }
            })
        )
        await Promise.all(processPromises)

        return await getCachedNews(symbol)
    } catch (error) {
        console.error(`[News] Failed to update ${symbol}:`, error)
        return await getCachedNews(symbol)
    }
}

async function getCachedNews(symbol: string) {
    return prisma.newsArticle.findMany({
        where: { symbol },
        orderBy: { publishedAt: 'desc' },
        take: 20
    })
}

export async function getMyHoldingsForNews(): Promise<NewsStock[]> {
    const session = await auth()
    if (!session?.user?.id) return []

    const holdings = await prisma.holding.findMany({
        where: {
            userId: session.user.id,
            stock: { market: { in: US_MARKETS } },
        },
        select: {
            stock: { select: { stockCode: true, stockName: true, engName: true } },
        },
        orderBy: { createdAt: 'asc' },
    })

    const seen = new Set<string>()
    const result: NewsStock[] = []
    for (const h of holdings) {
        const symbol = h.stock.stockCode
        if (seen.has(symbol)) continue
        if (isLikelyEtf(h.stock.stockName, h.stock.engName)) continue
        seen.add(symbol)
        result.push({
            symbol,
            name: h.stock.stockName,
            engName: h.stock.engName,
        })
    }
    return result
}
