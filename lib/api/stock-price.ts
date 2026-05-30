import { kisClient } from '@/lib/api/kis-client'

// 현재가 조회 헬퍼 (KIS API / LSE는 Stooq) — POST·PATCH /api/holdings 공용
export async function fetchCurrentPrice(stockCode: string, market: string): Promise<number> {
    if (market === 'LSE') {
        const { fetchLsePrice } = await import('@/lib/api/stooq')
        return fetchLsePrice(stockCode)
    }
    try {
        // 시장 타입 매핑 (US, KOSPI, KOSDAQ)
        // KIS Master DB는 NASD/NYSE/AMEX, KIS API 내부 코드는 NAS/NYS/AMS — 양쪽 모두 인식
        let marketType: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI'
        if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS'
            || market === 'NASD' || market === 'NYSE' || market === 'AMEX') {
            marketType = 'US'
        } else if (market === 'KOSDAQ' || market === 'KQ') {
            marketType = 'KOSDAQ'
        }

        const priceData = await kisClient.getCurrentPrice(stockCode, marketType)
        return priceData.price
    } catch (e) {
        console.error(`Failed to fetch price for ${stockCode}:`, e)
        return 0
    }
}

// 시장 정보로 통화 자동 감지 (KIS Master는 NASD/NYSE/AMEX, KIS API 내부는 NAS/NYS/AMS)
const US_MARKETS = ['US', 'NAS', 'NYS', 'AMS', 'NASD', 'NYSE', 'AMEX', 'LSE']
export function detectCurrency(market: string | null | undefined): 'USD' | 'KRW' {
    return US_MARKETS.includes(market || '') ? 'USD' : 'KRW'
}
