/**
 * 시장 개장 여부 판단 — 풋노트 노이즈 감소용.
 * 휴일 캘린더는 미고려 (평일/주말 + 정규 시간만).
 *   - KR: 평일 09:00–15:30 KST (Asia/Seoul)
 *   - US: 평일 09:30–16:00 ET (America/New_York, DST 자동 반영)
 */

export type Market = 'KR' | 'US'

function nowInTz(tz: string): { dow: number; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date())
    const dowStr = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
    const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    return { dow: dowMap[dowStr] ?? 0, minutes: (hour % 24) * 60 + minute }
}

export function isMarketOpenKR(): boolean {
    const { dow, minutes } = nowInTz('Asia/Seoul')
    if (dow === 0 || dow === 6) return false
    return minutes >= 9 * 60 && minutes < 15 * 60 + 30
}

export function isMarketOpenUS(): boolean {
    const { dow, minutes } = nowInTz('America/New_York')
    if (dow === 0 || dow === 6) return false
    return minutes >= 9 * 60 + 30 && minutes < 16 * 60
}

export function isAnyMarketOpen(markets: Iterable<Market>): boolean {
    let hasKR = false
    let hasUS = false
    for (const m of markets) {
        if (m === 'KR') hasKR = true
        else if (m === 'US') hasUS = true
    }
    if (hasKR && isMarketOpenKR()) return true
    if (hasUS && isMarketOpenUS()) return true
    return false
}

/**
 * 종목의 market 코드(KOSPI/KOSDAQ/KS/KQ/NASD/NYSE 등)를 표준화.
 * 알 수 없는 코드는 null.
 */
export function normalizeMarket(market: string | null | undefined): Market | null {
    if (!market) return null
    const m = market.toUpperCase()
    if (m === 'KOSPI' || m === 'KOSDAQ' || m === 'KS' || m === 'KQ') return 'KR'
    if (m === 'US' || m === 'NASD' || m === 'NAS' || m === 'NYSE' || m === 'NYS' || m === 'AMEX' || m === 'AMS') return 'US'
    return null
}

/**
 * Stock.market(KOSPI/KOSDAQ/NASD/NYSE/AMEX/LSE) → 시세 API 가 받는 market 파라미터.
 *
 * `/api/kis/price` 와 `/api/stocks/history` 는 'KOSPI'|'KOSDAQ'|'US' 만 허용하고,
 * 그 외 값은 각각 조용히 KOSPI 로 폴백하거나 400 을 낸다. DB 에는 'US' 가 한 건도 없고
 * NASD/NYSE/AMEX 로만 들어있으므로, 호출 전 반드시 이 함수를 거쳐야 한다.
 */
export function toPriceApiMarket(
    market: string | null | undefined,
    stockCode?: string,
): 'KOSPI' | 'KOSDAQ' | 'US' {
    const m = (market ?? '').toUpperCase()
    if (m === 'KOSDAQ' || m === 'KQ') return 'KOSDAQ'
    if (m === 'KOSPI' || m === 'KS') return 'KOSPI'
    if (normalizeMarket(m) === 'US' || m === 'LSE') return 'US'
    // market 미상 — 숫자 종목코드면 국내, 아니면 미국으로 추정
    return stockCode && stockCode.trim() !== '' && !Number.isNaN(Number(stockCode)) ? 'KOSPI' : 'US'
}

/** 종목이 기록될 통화. LSE 는 USD 표기 라인이므로 USD. */
export function detectMarketCurrency(
    market: string | null | undefined,
    stockCode?: string,
): 'KRW' | 'USD' {
    return toPriceApiMarket(market, stockCode) === 'US' ? 'USD' : 'KRW'
}
