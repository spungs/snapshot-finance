import { GoogleGenerativeAI } from '@google/generative-ai'

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY

const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

export interface SummaryResult {
    short: string  // 3 lines
    medium: string // 5 lines
    long: string   // 10 lines
}

export async function summarizeNews(title: string, originalSummary: string, source: string): Promise<SummaryResult | null> {
    if (!GOOGLE_AI_API_KEY) {
        console.warn('GOOGLE_AI_API_KEY is not set')
        return null
    }

    const prompt = `
    You are a professional financial news analyst.
    Summarize the following news article for a busy investor in Korean (한국어).
    
    News Title: ${title}
    Source: ${source}
    Content Snippet: ${originalSummary}

    Please provide 3 versions of the summary in a valid JSON format:
    1. "short": 3 concise bullet points.
    2. "medium": 5 detailed bullet points.
    3. "long": A 10-line comprehensive summary (can be paragraph or bullet points).

    IMPORTANT: Return ONLY the raw JSON string without markdown code blocks.
    JSON keys must be "short", "medium", "long".
  `

    try {
        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        // Clean up if markdown is included
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim()

        const parsed = JSON.parse(jsonStr)

        const toString = (val: string | string[]) => Array.isArray(val) ? val.join('\n') : val

        const summaries: SummaryResult = {
            short: toString(parsed.short),
            medium: toString(parsed.medium),
            long: toString(parsed.long)
        }
        return summaries
    } catch (error) {
        console.error('Gemini summarization error:', error)
        return null
    }
}
