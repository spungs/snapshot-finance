export const M7_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META']

export interface NewsStock {
    symbol: string
    name: string
    engName: string | null
}

export const M7: NewsStock[] = [
    { symbol: 'AAPL', name: 'Apple', engName: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft', engName: 'Microsoft' },
    { symbol: 'GOOGL', name: 'Alphabet', engName: 'Alphabet' },
    { symbol: 'AMZN', name: 'Amazon', engName: 'Amazon' },
    { symbol: 'NVDA', name: 'Nvidia', engName: 'Nvidia' },
    { symbol: 'TSLA', name: 'Tesla', engName: 'Tesla' },
    { symbol: 'META', name: 'Meta', engName: 'Meta' },
]

// ETF/펀드는 개별 기업 뉴스 대상이 아니므로 뉴스 노출 제외.
// 명시적 플래그가 스키마에 없어 종목명 휴리스틱으로 식별.
const ETF_NAME_PATTERNS = [
    /\bETF\b/i,
    /\bETN\b/i,
    /\bTrust\b/i,
    /\bFund\b/i,
    /\bIndex\b/i,
    /\biShares\b/i,
    /\bSPDR\b/i,
    /\bVanguard\b/i,
    /\bInvesco\b/i,
    /\bProShares\b/i,
    /\bDirexion\b/i,
    /\bWisdomTree\b/i,
    /\bVanEck\b/i,
    /\bARK\s+/i,
    /\bSchwab\s+.*\b(ETF|Fund)\b/i,
    /\bGlobal\s+X\b/i,
]

export function isLikelyEtf(name: string | null | undefined, engName?: string | null): boolean {
    const candidates = [name, engName].filter((s): s is string => !!s)
    return candidates.some(s => ETF_NAME_PATTERNS.some(rx => rx.test(s)))
}
