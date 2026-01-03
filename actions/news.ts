'use server'

import { prisma } from '@/lib/prisma'
import { fetchCompanyNews, NewsItem } from '@/lib/news/fetcher'
import { summarizeNews } from '@/lib/ai/summarizer'
import { addHours } from 'date-fns'

const CACHE_DURATION_HOURS = 1

export async function getBigTechNews(symbol: string) {
    try {
        // 1. Check DB for recent cached news (within last 4 hours)
        // We check if *any* news for this symbol was added recently to avoid re-fetching API too often
        const recentUpdate = await prisma.newsArticle.findFirst({
            where: {
                symbol,
                createdAt: {
                    gt: addHours(new Date(), -CACHE_DURATION_HOURS)
                }
            }
        })

        if (!recentUpdate) {
            // 2. Fetch fresh news from API
            console.log(`Fetching fresh news for ${symbol}...`)
            const freshNews = await fetchCompanyNews(symbol)

            // 3. Process and Save
            for (const item of freshNews) {
                // Check if article already exists (by URL)
                const exists = await prisma.newsArticle.findUnique({
                    where: { url: item.url }
                })

                if (!exists) {
                    // Add delay to avoid rate limiting (3s as requested)
                    await new Promise(resolve => setTimeout(resolve, 3000));
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
                    }
                }
            }
        }

        // 4. Return all news for this symbol (sorted by new)
        const news = await prisma.newsArticle.findMany({
            where: { symbol },
            orderBy: { publishedAt: 'desc' },
            take: 20
        })

        return news

    } catch (error) {
        console.error('Failed to get news:', error)
        return []
    }
}
