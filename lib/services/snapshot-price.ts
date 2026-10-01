import { kisClient } from '@/lib/api/kis-client'
import { cacheGet, stockPriceKey, type PriceCacheEntry } from '@/lib/cache'

/** 스냅샷 가격을 어디서 얻었는지 — CronLog 에 남겨 폴백이 잦아지면 알아챌 수 있게 한다. */
export type SnapshotPriceSource = 'close' | 'current' | 'cache'

export interface PriceAttempt {
    source: SnapshotPriceSource
    fetch: () => Promise<number | null | undefined>
}

export interface ResolvedPrice {
    price: number
    source: SnapshotPriceSource
    /** 앞 단계들이 넘어간 사유. 휴장일엔 'close: no data' 가 정상적으로 찍힌다. */
    failures: string[]
}

/**
 * attempts 를 순서대로 시도해 처음 얻은 유효 가격(양의 유한수)을 돌려준다.
 * 예외·빈 값은 사유만 모으고 다음으로 넘어가며, 전부 실패하면 사유를 묶어 throw 한다.
 */
export async function firstValidPrice(attempts: PriceAttempt[]): Promise<ResolvedPrice> {
    const failures: string[] = []
    for (const { source, fetch } of attempts) {
        try {
            const price = await fetch()
            if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
                return { price, source, failures }
            }
            failures.push(`${source}: no data`)
        } catch (e) {
            failures.push(`${source}: ${e instanceof Error ? e.message : String(e)}`)
        }
    }
    throw new Error(failures.join(' / '))
}

/**
 * 일간 스냅샷에 동결할 종목 가격 — tradingDate 거래일의 **종가**.
 *
 * 예전엔 Redis 시세 캐시를 먼저 읽었다. 캐시를 채우는 update-prices-us 의 마지막 실행이
 * 20:57 UTC 라, 서머타임이 끝나 미국장 마감이 21:00 UTC 가 되면 마감 3분 전 가격이
 * '종가'로 박혔다. 스냅샷 크론은 21:35 UTC 에 돌아 계절과 무관하게 한·미 정규장이 모두
 * 끝난 뒤이므로 직접 조회한다.
 *
 * 1) 일봉 종가 — 공식 종가. 휴장일이면 그날 일봉이 없어 null.
 * 2) 현재가(캐시 우회) — 장 마감 후라 마지막 종가와 같다. 휴장일·일봉 조회 실패 대비.
 * 3) Redis 캐시 — 직접 조회가 모두 실패했을 때만. 최대 4시간(TTL) 묵은 값이지만, 종목을
 *    통째로 빼서 총자산이 그만큼 줄어드는 것보다 오차가 작다.
 *
 * @param canUseNetwork false 를 돌려주면 1·2단계를 건너뛰고 캐시만 본다. KIS 가 응답 없이
 *        멈추면 종목마다 타임아웃(5s)이 쌓여 크론이 maxDuration 에 잘리므로, 호출부가
 *        실행 시간 예산을 넘겼을 때 외부 조회를 끊는 데 쓴다.
 */
export function getSnapshotClosePrice(
    symbol: string,
    market: 'KOSPI' | 'KOSDAQ' | 'US',
    tradingDate: string,
    canUseNetwork: () => boolean = () => true,
): Promise<ResolvedPrice> {
    const viaNetwork = (fn: () => Promise<number | null | undefined>) => () =>
        canUseNetwork() ? fn() : Promise.reject(new Error('time budget exceeded'))

    return firstValidPrice([
        {
            source: 'close',
            fetch: viaNetwork(async () => (await kisClient.getDailyPrice(symbol, market, tradingDate))?.close),
        },
        {
            source: 'current',
            fetch: viaNetwork(async () => (await kisClient.getCurrentPrice(symbol, market, 0, true)).price),
        },
        {
            source: 'cache',
            fetch: async () => (await cacheGet<PriceCacheEntry>(stockPriceKey(symbol)))?.price,
        },
    ])
}
