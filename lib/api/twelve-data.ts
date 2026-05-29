// Twelve Data symbol_search — 종목 메타(이름/통화/거래소) 조회.
// LSE 의 USD-표시 종목만 필터해 반환. 시세(/quote,/price)는 LSE 유료라 사용 안 함(stooq 사용).
// symbol_search 는 무료 + 키 불필요하지만, 키가 있으면 함께 전송.

const TD_BASE = 'https://api.twelvedata.com/symbol_search'

export type TwelveDataMatch = {
    symbol: string
    name: string
    exchange: string
    micCode: string
    currency: string
}

/**
 * Twelve Data 에서 LSE / USD 종목 검색.
 * @param query ticker 또는 이름 (예: 'HIM3')
 * @returns LSE 거래소 + USD 통화 매치 목록 (없으면 빈 배열)
 */
export async function searchLseUsdStocks(query: string): Promise<TwelveDataMatch[]> {
    const q = query.trim()
    if (!q) return []
    const key = process.env.TWELVE_DATA_API_KEY
    const url = `${TD_BASE}?symbol=${encodeURIComponent(q)}${key ? `&apikey=${key}` : ''}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
        if (!res.ok) return []
        const body = await res.json() as { data?: unknown }
        const data = Array.isArray(body.data) ? body.data : []

        return data
            .map((d) => d as Record<string, unknown>)
            .filter((d) => d.exchange === 'LSE' && d.currency === 'USD')
            .map((d) => ({
                symbol: String(d.symbol ?? ''),
                name: String(d.instrument_name ?? d.symbol ?? ''),
                exchange: String(d.exchange ?? 'LSE'),
                micCode: String(d.mic_code ?? 'XLON'),
                currency: String(d.currency ?? 'USD'),
            }))
            .filter((m) => m.symbol.length > 0)
    } catch (e) {
        console.warn(`[twelve-data] search failed for ${query}:`, e)
        return []
    } finally {
        clearTimeout(timer)
    }
}
