'use server'

import { prisma } from '@/lib/prisma'
import { fetchCompanyNews, NewsItem } from '@/lib/news/fetcher'
import { summarizeNews } from '@/lib/ai/summarizer'
import { addHours } from 'date-fns'
import pLimit from 'p-limit'

// Limit concurrent AI requests to 3 to avoid rate limits (Gemini Free: 15 RPM)
const limit = pLimit(3)

const CACHE_DURATION_HOURS = 1

export async function getBigTechNews(symbol: string) {
    try {
        console.log(`[News] Starting update for ${symbol}...`)

        // 1. Fetch fresh news from API
        // We always fetch to ensure we have the latest, but we check DB before AI processing
        const freshNews = await fetchCompanyNews(symbol)

        if (freshNews.length === 0) {
            console.log(`[News] No news found for ${symbol}`)
            return await getCachedNews(symbol)
        }

        // 2. Bulk Check: Filter out articles that already exist in DB
        const urlsToCheck = freshNews.map(n => n.url)
        const existingArticles = await prisma.newsArticle.findMany({
            where: {
                url: { in: urlsToCheck }
            },
            select: { url: true }
        })

        const existingUrls = new Set(existingArticles.map(a => a.url))
        const newArticles = freshNews.filter(item => !existingUrls.has(item.url))

        console.log(`[News] ${symbol}: Found ${freshNews.length} items, ${newArticles.length} are new.`)

        // 3. Process New Articles with Concurrency Control
        // Use p-limit to process AI summarization in parallel but limited to 3 concurrent
        const processPromises = newArticles.map(item =>
            limit(async () => {
                try {
                    // Double check (redundant but safe for race conditions if needed)
                    // Skip detailed check for speed unless strictly necessary

                    // Generate AI Summary
                    const summaries = await summarizeNews(item.title, item.originalSummary, item.source)

                    if (summaries) {
                        await prisma.newsArticle.create({
                            data: {
                                symbol,
                                title: item.title,
                                url: item.url,
                                publishedAt: item.publishedAt,
                                source: item.source,
                                imageUrl: item.imageUrl,
                                summaryShort: summaries.short,
                                summaryMedium: summaries.medium,
                                summaryLong: summaries.long
                            }
                        })
                        return { status: 'success', url: item.url }
                    }
                    return { status: 'skipped', url: item.url, reason: 'no_summary' }
                } catch (error) {
                    console.error(`[News] Error processing article ${item.url}:`, error)
                    return { status: 'error', url: item.url, error }
                }
            })
        )

        await Promise.all(processPromises)

        // 4. Return all news for this symbol (sorted by new)
        return await getCachedNews(symbol)

    } catch (error) {
        console.error(`[News] Failed to update ${symbol}:`, error)
        // Return existing news even if update failed
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
