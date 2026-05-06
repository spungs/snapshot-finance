'use server'

import { prisma } from '@/lib/prisma'
import { fetchCompanyNews } from '@/lib/news/fetcher'
import { summarizeNews } from '@/lib/ai/summarizer'
import { auth } from '@/lib/auth'
import { isLikelyEtf, type NewsStock } from '@/lib/news/m7'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'
import { headers } from 'next/headers'
import pLimit from 'p-limit'

// Limit concurrent AI requests to 3 to avoid rate limits (Gemini Free: 15 RPM)
const limit = pLimit(3)

const US_MARKETS = ['US', 'NAS', 'NYS', 'AMS']
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/i

// Cron 라우트는 Authorization: Bearer ${CRON_SECRET} 로 들어오는데,
// getStockNews를 직접 import해 호출하므로 incoming request 헤더가 그대로 살아있다.
async function isAuthorizedCallerForNews(): Promise<boolean> {
    const session = await auth()
    if (session?.user?.id) return true

    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
        const h = await headers()
        const authz = h.get('authorization')
        if (authz === `Bearer ${cronSecret}`) return true
    }
    return false
}

export async function getStockNews(symbol: string, keywords?: string[]) {
    // 인증 — 세션 사용자 OR cron secret 헤더만 허용 (외부 비인증 호출은 모두 차단)
    if (!(await isAuthorizedCallerForNews())) {
        console.warn(`[News] Unauthorized getStockNews call blocked for symbol=${symbol}`)
        return []
    }

    // symbol 화이트리스트 — Finnhub/AI에 보낼 값을 제한해 토큰 abuse 방지
    if (typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) {
        console.warn(`[News] Invalid symbol rejected: ${symbol}`)
        return []
    }

    // 사용자 세션이 있으면 user 단위 rate limit, 없으면(cron) skip
    const session = await auth()
    if (session?.user?.id) {
        const rl = await checkRateLimit(ratelimit.ai, `news:${session.user.id}`)
        if (rl && !rl.success) {
            console.warn(`[News] Rate limited user=${session.user.id}`)
            return await getCachedNews(symbol)
        }
    }

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
