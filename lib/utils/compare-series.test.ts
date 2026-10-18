import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCompareRows, kstDateKey, periodStart } from './compare-series'
import type { ChartDataPoint } from '@/lib/services/snapshot-service'

// 실행: npx tsx --test lib/utils/compare-series.test.ts
// 운영 서버(Vercel)는 UTC — 날짜 키가 실행 환경 타임존에 흔들리지 않는지 UTC 로 고정해 검증한다.
process.env.TZ = 'UTC'

function pt(date: string, profitRate: number, totalAsset: number): ChartDataPoint {
    return { id: date, date, totalValue: totalAsset, totalCost: 0, totalProfit: 0, profitRate, cashBalance: 0, totalAsset }
}

test('두 사람 시리즈를 날짜로 맞추고, 한쪽에 없는 날은 null', () => {
    const me = [pt('2026-10-01T12:00:00.000Z', 1, 100), pt('2026-10-02T12:00:00.000Z', 2, 200)]
    const other = [pt('2026-10-02T12:00:00.000Z', 5, 500), pt('2026-10-03T12:00:00.000Z', 6, 600)]
    assert.deepEqual(buildCompareRows([me, other], 'profitRate', null), [
        { dateKey: '2026-10-01', values: [1, null] },
        { dateKey: '2026-10-02', values: [2, 5] },
        { dateKey: '2026-10-03', values: [null, 6] },
    ])
})

test('같은 날 스냅샷이 여러 개면 그날 마지막 값', () => {
    const me = [pt('2026-10-01T10:00:00.000Z', 1, 100), pt('2026-10-01T12:00:00.000Z', 3, 300)]
    assert.deepEqual(buildCompareRows([me], 'profitRate', null), [
        { dateKey: '2026-10-01', values: [3] },
    ])
})

test('totalAsset 지표는 totalAsset 값을 쓴다', () => {
    const me = [pt('2026-10-01T12:00:00.000Z', 1, 100)]
    assert.deepEqual(buildCompareRows([me], 'totalAsset', null), [
        { dateKey: '2026-10-01', values: [100] },
    ])
})

test('fromDate 이전 스냅샷은 제외', () => {
    const me = [pt('2026-09-01T12:00:00.000Z', 1, 100), pt('2026-10-01T12:00:00.000Z', 2, 200)]
    assert.deepEqual(buildCompareRows([me], 'profitRate', new Date('2026-09-15T00:00:00.000Z')), [
        { dateKey: '2026-10-01', values: [2] },
    ])
})

test('스냅샷이 없는 사람은 null 만, 아무도 없거나 기간 밖이면 빈 배열', () => {
    const me = [pt('2026-10-01T12:00:00.000Z', 1, 100)]
    assert.deepEqual(buildCompareRows([me, []], 'profitRate', null), [
        { dateKey: '2026-10-01', values: [1, null] },
    ])
    assert.deepEqual(buildCompareRows([[], []], 'profitRate', null), [])
    assert.deepEqual(buildCompareRows([me], 'profitRate', new Date('2026-11-01T00:00:00.000Z')), [])
})

test('날짜 키는 실행 환경과 무관하게 KST — 21:35Z 자동 스냅샷은 KST 다음 날', () => {
    assert.equal(kstDateKey('2026-10-17T21:35:00.000Z'), '2026-10-18')
    const me = [pt('2026-10-17T21:35:00.000Z', 1, 100)]
    assert.deepEqual(buildCompareRows([me], 'profitRate', null), [
        { dateKey: '2026-10-18', values: [1] },
    ])
})

test('periodStart: 3M 은 3개월 전, ALL 은 null, now 를 변형하지 않음', () => {
    const now = new Date('2026-10-18T12:00:00.000Z')
    assert.equal(periodStart('3M', now)?.toISOString(), '2026-07-18T12:00:00.000Z')
    assert.equal(periodStart('ALL', now), null)
    assert.equal(now.toISOString(), '2026-10-18T12:00:00.000Z')
})
