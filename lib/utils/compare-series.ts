import type { ChartDataPoint } from '@/lib/services/snapshot-service'

// 추이 비교 화면(/dashboard/compare) 전용 순수 함수.
// 여러 사람의 스냅샷 차트 데이터를 KST 날짜(yyyy-MM-dd) 기준으로 한 행씩 맞춘다.

// 서버(Vercel, UTC)와 브라우저(KST)가 같은 날짜를 내도록 타임존을 고정한다 — 실행 환경 로컬
// 타임존을 쓰면 21:35Z 자동 스냅샷이 서버에선 전날, 브라우저에선 다음 날이 돼 하이드레이션이 어긋난다.
const KST_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

export function kstDateKey(iso: string): string {
    const parts = KST_DATE.formatToParts(new Date(iso))
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
}

export type ComparePeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL'
export type CompareMetric = 'profitRate' | 'totalAsset'

export interface CompareRow {
    dateKey: string            // yyyy-MM-dd
    values: (number | null)[]  // series 순서와 동일. 그날 스냅샷이 없으면 null
}

// 홈 성과 흐름 차트(PerformanceChart)의 startDateForPeriod 와 같은 규칙. now 주입은 테스트용.
export function periodStart(period: ComparePeriod, now: Date = new Date()): Date | null {
    const d = new Date(now)
    switch (period) {
        case '1M': d.setMonth(d.getMonth() - 1); return d
        case '3M': d.setMonth(d.getMonth() - 3); return d
        case '6M': d.setMonth(d.getMonth() - 6); return d
        case '1Y': d.setFullYear(d.getFullYear() - 1); return d
        case 'ALL':
        default: return null
    }
}

/**
 * series[i] = 한 사람의 스냅샷 배열 (날짜 오름차순 — getChartData 정렬 그대로).
 * 같은 날 스냅샷이 여러 개면 그날 마지막 값을 쓴다.
 */
export function buildCompareRows(
    series: ChartDataPoint[][],
    metric: CompareMetric,
    fromDate: Date | null,
): CompareRow[] {
    const byDay = series.map((points) => {
        const m = new Map<string, number>()
        for (const p of points) {
            if (fromDate && new Date(p.date) < fromDate) continue
            m.set(kstDateKey(p.date), metric === 'profitRate' ? p.profitRate : p.totalAsset)
        }
        return m
    })
    const keys = new Set<string>()
    for (const m of byDay) for (const k of m.keys()) keys.add(k)
    return Array.from(keys).sort().map((dateKey) => ({
        dateKey,
        values: byDay.map((m) => m.get(dateKey) ?? null),
    }))
}
