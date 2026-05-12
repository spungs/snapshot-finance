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
