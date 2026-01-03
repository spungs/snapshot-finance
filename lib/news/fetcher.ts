import { startOfDay, endOfDay, subDays, format } from 'date-fns'

interface FinnhubNewsItem {
    category: string
    datetime: number
    headline: string
    id: number
    image: string
    related: string
    source: string
    summary: string
    url: string
    language?: string
}

export interface NewsItem {
    symbol: string
    title: string
    url: string
    publishedAt: Date
    source: string
    imageUrl: string
    originalSummary: string
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY

export async function fetchCompanyNews(symbol: string): Promise<NewsItem[]> {
    if (!FINNHUB_API_KEY) {
        console.warn('FINNHUB_API_KEY is not set')
        return []
    }

    // Fetch news for the last 24 hours (expanded to 2 days to ensure coverage)
    const today = new Date()
    const fromDate = format(subDays(today, 2), 'yyyy-MM-dd')
    const toDate = format(today, 'yyyy-MM-dd')

    const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`

    try {
        const response = await fetch(url, { next: { revalidate: 3600 } }) // Cache for 1 hour

        if (!response.ok) {
            console.error(`Finnhub API error: ${response.status} ${response.statusText}`)
            return []
        }

        const data: FinnhubNewsItem[] = await response.json()

        // Filter and map
        return data
            // .filter(item => item.language === '' || item.language === 'en') // Removed unsafe filter
            .map(item => ({
                symbol,
                title: item.headline,
                url: item.url,
                publishedAt: new Date(item.datetime * 1000),
                source: item.source,
                imageUrl: item.image,
                originalSummary: item.summary
            }))
            .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
            .slice(0, 5) // Limit to top 5 most recent news per symbol to save AI tokens
    } catch (error) {
        console.error('Error fetching news from Finnhub:', error)
        return []
    }
}
