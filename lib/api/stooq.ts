// stooq 무료 CSV API — 전일 종가 조회.
// LSE 종목은 `{ticker}.uk` 형식. 키 불필요.
// CSV: Symbol,Date,Time,Open,High,Low,Close,Volume,Name
// Close 가 전일(또는 최근 거래일) 종가. 데이터 없으면 N/D.

const STOOQ_BASE = 'https://stooq.com/q/l/'

export type StooqQuote = {
    close: number
    date: string // YYYY-MM-DD
    name: string
}

/**
 * stooq 에서 LSE 종목 전일 종가 조회.
 * @param ticker 예: 'HIM3' (내부에서 .uk 부착)
 * @returns 종가 + 날짜, 데이터 없으면 null
 */
export async function getStooqDailyClose(ticker: string): Promise<StooqQuote | null> {
    const clean = ticker.trim().toLowerCase()
    if (!clean) return null
    const url = `${STOOQ_BASE}?s=${encodeURIComponent(clean)}.uk&f=sd2t2ohlcvn&h&e=csv`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
        if (!res.ok) return null
        const text = await res.text()
        const lines = text.trim().split(/\r?\n/)
        if (lines.length < 2) return null

        // 헤더: Symbol,Date,Time,Open,High,Low,Close,Volume,Name
        const cols = lines[1].split(',')
        if (cols.length < 9) return null

        const date = cols[1]
        const close = parseFloat(cols[6])
        const name = cols.slice(8).join(',').trim()

        // 데이터 없는 종목은 Close 가 'N/D'
        if (date === 'N/D' || !Number.isFinite(close) || close <= 0) return null

        return { close, date, name }
    } catch (e) {
        console.warn(`[stooq] failed for ${ticker}:`, e)
        return null
    } finally {
        clearTimeout(timer)
    }
}
