import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

// 캐시를 위한 간단한 인메모리 저장소
let cachedRate: { price: number; timestamp: number } | null = null
const CACHE_DURATION = 1000 * 60 * 5 // 5분

export async function getUsdExchangeRate(): Promise<number> {
    try {
        const now = Date.now()

        // 캐시된 환율이 있고 유효하면 사용
        if (cachedRate && (now - cachedRate.timestamp < CACHE_DURATION)) {
            return cachedRate.price
        }

        // 야후 파이낸스에서 USD/KRW 환율 조회 (심볼: KRW=X)
        const result = await yahooFinance.quote('KRW=X') as any
        const rate = result.regularMarketPrice

        if (!rate) {
            throw new Error('Failed to fetch exchange rate')
        }

        // 캐시 업데이트
        cachedRate = {
            price: rate,
            timestamp: now
        }

        return rate
    } catch (error) {
        console.error('Exchange rate fetch error:', error)
        // 에러 발생 시 캐시가 있으면 사용, 없으면 기본값 1400 (임시)
        return cachedRate?.price || 1400
    }
}
