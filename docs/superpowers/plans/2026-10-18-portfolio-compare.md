# 포트폴리오 추이 비교 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 자산 추이와 위임으로 관리 중인 포트폴리오(여자친구)의 추이를 한 화면 한 차트에 겹쳐 비교하는 `/dashboard/compare` 를 추가한다.

**Architecture:** 서버 페이지가 grant(`listManagedPortfolios(actorId)`)로만 비교 대상을 정하고, 사람별 `snapshotService.getChartData()` + 실환율을 조회해 클라이언트 차트에 넘긴다. 날짜 정렬은 순수 함수(`lib/utils/compare-series.ts`)로 분리해 단위 테스트한다. '더보기'는 서버 껍데기 + 클라이언트 본문으로 나눠 grant 가 있을 때만 '함께 보기' 그룹을 노출한다.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, Recharts 3, Tailwind v4, node:test + tsx(단위 테스트 — 프로젝트에 테스트 프레임워크가 없어 추가 의존성 없이 실행)

**Spec:** `docs/superpowers/specs/2026-10-18-portfolio-compare-design.md`

## Global Constraints

- 새 API·스키마 변경·마이그레이션 없음.
- 비교 대상은 서버가 grant 로만 결정. `ctx.portfolioUserId` / `active_portfolio` 쿠키 / 쿼리 파라미터를 대상 결정에 쓰지 않는다.
- 값의 의미는 홈 차트와 동일: 수익률 = 스냅샷 `profitRate`(이미 % 단위), 총자산 = `totalAsset`(주식 평가금 + 예수금).
- USD 표시 모드는 서버에서 받은 `getUsdExchangeRate()` 실환율로 나눈다 (하드코딩 1435 금지).
- 선 색: `var(--chart-3)`(나), `var(--chart-4)`(상대), 그 다음 `var(--chart-5)`. `--profit`/`--loss` 를 선 색으로 쓰지 않는다.
- 기본 지표 = 수익률, 기본 기간 = 3M. 기간 = 1M/3M/6M/1Y/ALL.
- grant 없는 사용자의 '더보기' 화면은 픽셀 변화 없음.
- 모든 UI 문구는 ko/en 둘 다. 응답·커밋 메시지는 한국어, 커밋 메시지에 Co-Authored-By 등 자동 생성 문구 금지.
- 커밋/푸시는 사용자 승인 후에만 (각 Task 끝에 커밋 단계 없음 — 마지막 Task 에서 일괄 확인).
- 로컬 검증 데이터 조작은 **로컬 PG(`.env.development.local`) 에만**. dev 에선 Redis 캐시가 꺼져 있다(`lib/cache.ts` `isProduction` 가드).

## Review Focus

1. **한 사람 스냅샷 0개** (로컬 여자친구 계정의 실제 상태) — 그 사람 선만 없고 요약 줄에 "스냅샷 없음", 크래시 없음. → Task 1 테스트 `스냅샷이 없는 사람` + Task 2 Step 9.
2. **관리 중(배너 노출) 상태에서 진입** — 첫 줄은 여전히 '나'(actor), 상대는 owner 이름. → Task 2 Step 12.
3. **grant 없는 계정이 URL 직접 입력** — 500/빈 차트가 아니라 `/dashboard/more` 로 리다이렉트. → Task 2 Step 8.
4. **선택 기간에 아무 스냅샷도 없음** — 빈 차트 대신 "이 기간에 스냅샷이 없습니다." → Task 1 테스트(기간 밖 → `[]`) + Task 2 Step 11.
5. **USD 표시 모드** — 차트·툴팁·요약 줄의 총자산이 같은 실환율로 환산되고 수익률은 그대로. → Task 2 Step 13.

---

### Task 1: 날짜 정렬 순수 함수 + 단위 테스트

**Files:**
- Create: `lib/utils/compare-series.ts`
- Test: `lib/utils/compare-series.test.ts`

**Interfaces:**
- Consumes: `ChartDataPoint` (`lib/services/snapshot-service.ts:95` — `{ id, date: string(ISO), totalValue, totalCost, totalProfit, profitRate, cashBalance, totalAsset }`), `formatDate(date, fmt)` (`lib/utils/formatters.ts:91`, date-fns 로컬 타임존)
- Produces:
  - `type ComparePeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL'`
  - `type CompareMetric = 'profitRate' | 'totalAsset'`
  - `interface CompareRow { dateKey: string; values: (number | null)[] }`
  - `periodStart(period: ComparePeriod, now?: Date): Date | null`
  - `buildCompareRows(series: ChartDataPoint[][], metric: CompareMetric, fromDate: Date | null): CompareRow[]`

- [ ] **Step 1: 실패하는 테스트 작성** — `lib/utils/compare-series.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCompareRows, periodStart } from './compare-series'
import type { ChartDataPoint } from '@/lib/services/snapshot-service'

// 실행: npx tsx --test lib/utils/compare-series.test.ts
// 날짜 키는 로컬 타임존 기준 — 시각을 UTC 정오 근처로 고정해 KST/UTC 어디서든 같은 날이 되게 한다.

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

test('periodStart: 3M 은 3개월 전, ALL 은 null, now 를 변형하지 않음', () => {
    const now = new Date('2026-10-18T12:00:00.000Z')
    assert.equal(periodStart('3M', now)?.toISOString(), '2026-07-18T12:00:00.000Z')
    assert.equal(periodStart('ALL', now), null)
    assert.equal(now.toISOString(), '2026-10-18T12:00:00.000Z')
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx --test lib/utils/compare-series.test.ts`
Expected: FAIL — `Cannot find module './compare-series'` (또는 ERR_MODULE_NOT_FOUND)

- [ ] **Step 3: 최소 구현** — `lib/utils/compare-series.ts`

```ts
import { formatDate } from '@/lib/utils/formatters'
import type { ChartDataPoint } from '@/lib/services/snapshot-service'

// 추이 비교 화면(/dashboard/compare) 전용 순수 함수.
// 여러 사람의 스냅샷 차트 데이터를 로컬 날짜(yyyy-MM-dd) 기준으로 한 행씩 맞춘다.

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
            m.set(formatDate(p.date, 'yyyy-MM-dd'), metric === 'profitRate' ? p.profitRate : p.totalAsset)
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx --test lib/utils/compare-series.test.ts`
Expected: `# pass 6`, `# fail 0`

- [ ] **Step 5: 타입·린트**

Run: `npx tsc --noEmit -p . && npx eslint lib/utils/compare-series.ts lib/utils/compare-series.test.ts`
Expected: 출력 없음(에러 0)

---

### Task 2: 비교 페이지(접근 제어) + 비교 차트 컴포넌트

**Files:**
- Create: `app/dashboard/compare/page.tsx`
- Create: `app/dashboard/compare/loading.tsx`
- Create: `components/dashboard/compare-chart.tsx`
- Modify: `lib/i18n/translations.ts` (ko `moreAccountsDesc` 다음 줄 ≈77, en `"moreAccountsDesc"` 다음 줄 ≈612)

**Interfaces:**
- Consumes: Task 1 의 `buildCompareRows`, `periodStart`, `CompareMetric`, `ComparePeriod`, `CompareRow`; `getPortfolioContext()`, `listManagedPortfolios(actorId): Promise<Array<{ ownerId: string; name: string }>>` (`lib/portfolio-context.ts`); `snapshotService.getChartData(userId): Promise<ChartDataPoint[]>`; `getUsdExchangeRate(): Promise<number>` (`lib/api/exchange-rate.ts:145`, 실패 시 내부 폴백 반환)
- Produces:
  - `interface CompareSeries { userId: string; name: string | null; isSelf: boolean; points: ChartDataPoint[] }`
  - `CompareChart({ series, exchangeRate }: { series: CompareSeries[]; exchangeRate: number })`
  - 번역 키 `moreCompareTitle` (Task 3 메뉴 항목도 사용)

- [ ] **Step 1: 번역 키 추가** — `lib/i18n/translations.ts`

ko 블록, `moreAccountsDesc: '증권 계좌 추가/순서/이름 관리',` 바로 다음 줄에:

```ts
        moreCompareTitle: '추이 비교',
```

en 블록, `"moreAccountsDesc": "Add, rename, or reorder brokerage accounts",` 바로 다음 줄에:

```ts
        "moreCompareTitle": "Compare trends",
```

- [ ] **Step 2: 차트 컴포넌트 작성** — `components/dashboard/compare-chart.tsx`

```tsx
'use client'

import { useMemo, useState } from 'react'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts'
import { BarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { ChartDataPoint } from '@/lib/services/snapshot-service'
import {
    buildCompareRows,
    periodStart,
    type CompareMetric,
    type ComparePeriod,
    type CompareRow,
} from '@/lib/utils/compare-series'

// 선 색 — 수익(빨강)/손실(파랑) 색과 겹치지 않는 차트 토큰. 테마 전환에 자동 추종.
const SERIES_COLORS = ['var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

const PERIODS: ComparePeriod[] = ['1M', '3M', '6M', '1Y', 'ALL']
const PERIOD_LABELS: Record<ComparePeriod, { ko: string; en: string }> = {
    '1M': { ko: '1개월', en: '1M' },
    '3M': { ko: '3개월', en: '3M' },
    '6M': { ko: '6개월', en: '6M' },
    '1Y': { ko: '1년', en: '1Y' },
    'ALL': { ko: '전체', en: 'All' },
}

export interface CompareSeries {
    userId: string
    name: string | null       // owner 표시명. 나(isSelf)는 null — 라벨은 언어에 맞춰 '나'/'Me'
    isSelf: boolean
    points: ChartDataPoint[]  // 날짜 오름차순
}

interface CompareChartProps {
    series: CompareSeries[]
    exchangeRate: number      // USD 표시 모드 환산용 (서버 실환율)
}

interface TooltipEntry {
    name?: string
    value?: number | null
    color?: string
}

function CompareTooltip({ active, payload, label, format }: {
    active?: boolean
    payload?: TooltipEntry[]
    label?: string
    format: (v: number) => string
}) {
    if (!active || !payload || payload.length === 0) return null
    const entries = payload.filter((p) => typeof p.value === 'number')
    if (entries.length === 0) return null
    return (
        <div className="bg-card border border-border/60 rounded-xl p-3 shadow-xl text-sm min-w-[168px]">
            <p className="text-muted-foreground text-xs mb-2 font-medium">
                {label ? label.replace(/-/g, '.') : ''}
            </p>
            <div className="space-y-1">
                {entries.map((p) => (
                    <div key={p.name} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                            <span className="text-xs text-muted-foreground truncate">{p.name}</span>
                        </span>
                        <span className="text-xs font-bold numeric text-foreground">{format(p.value as number)}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function formatAssetTick(v: number, currency: string): string {
    if (currency === 'KRW') {
        if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`
        if (v >= 10000) return `${(v / 10000).toFixed(0)}만`
        return String(v)
    }
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`
    return `$${v}`
}

export function CompareChart({ series, exchangeRate }: CompareChartProps) {
    const { language, t } = useLanguage()
    const { baseCurrency } = useCurrency()
    const [metric, setMetric] = useState<CompareMetric>('profitRate')
    const [period, setPeriod] = useState<ComparePeriod>('3M')

    const labels = series.map((s) => (s.isSelf ? (language === 'ko' ? '나' : 'Me') : (s.name ?? '')))
    // 총자산은 원화 저장값 — USD 표시 모드면 실환율로 나눈다. 수익률은 통화와 무관.
    const assetDivisor = baseCurrency === 'USD' ? exchangeRate : 1

    const rows = useMemo<CompareRow[]>(() => {
        const base = buildCompareRows(series.map((s) => s.points), metric, periodStart(period))
        if (metric !== 'totalAsset' || assetDivisor === 1) return base
        return base.map((r) => ({ ...r, values: r.values.map((v) => (v === null ? null : v / assetDivisor)) }))
    }, [series, metric, period, assetDivisor])

    const formatValue = (v: number) =>
        metric === 'profitRate' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : formatCurrency(v, baseCurrency)

    const toggleClass = (selected: boolean) => cn(
        'px-2.5 py-1 whitespace-nowrap rounded-md transition-colors',
        selected
            ? 'bg-card text-foreground font-bold shadow-sm'
            : 'text-muted-foreground font-medium hover:text-foreground',
    )

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full">
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[2rem] text-foreground">{t('moreCompareTitle')}</h1>
            </section>

            <div className="px-4">
                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-row items-center gap-2 flex-wrap">
                            <div
                                role="group"
                                aria-label={language === 'ko' ? '차트 메트릭 선택' : 'Chart metric'}
                                className="flex rounded-lg bg-secondary p-0.5 text-xs"
                            >
                                <button type="button" aria-pressed={metric === 'profitRate'} onClick={() => setMetric('profitRate')} className={toggleClass(metric === 'profitRate')}>
                                    {language === 'ko' ? '수익률' : 'Return'}
                                </button>
                                <button type="button" aria-pressed={metric === 'totalAsset'} onClick={() => setMetric('totalAsset')} className={toggleClass(metric === 'totalAsset')}>
                                    {language === 'ko' ? '자산' : 'Asset'}
                                </button>
                            </div>
                            <div
                                role="group"
                                aria-label={language === 'ko' ? '기간 선택' : 'Period'}
                                className="flex rounded-lg bg-secondary p-0.5 text-xs"
                            >
                                {PERIODS.map((p) => (
                                    <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={toggleClass(period === p)}>
                                        {PERIOD_LABELS[p][language as 'ko' | 'en']}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent>
                        {rows.length === 0 ? (
                            <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                                <BarChart2 className="h-8 w-8 opacity-30" />
                                <p>{language === 'ko' ? '이 기간에 스냅샷이 없습니다.' : 'No snapshots in this period.'}</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                                    <XAxis
                                        dataKey="dateKey"
                                        tickFormatter={(k: string) => k.slice(5).replace('-', '.')}
                                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                        tickLine={false}
                                        axisLine={false}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        tickFormatter={(v: number) => (metric === 'profitRate' ? `${v.toFixed(1)}%` : formatAssetTick(v, baseCurrency))}
                                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                        tickLine={false}
                                        axisLine={false}
                                        domain={['auto', 'auto']}
                                        width={metric === 'profitRate' ? 52 : 56}
                                    />
                                    <Tooltip
                                        content={<CompareTooltip format={formatValue} />}
                                        cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    />
                                    {metric === 'profitRate' && (
                                        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />
                                    )}
                                    {series.map((s, i) => (
                                        <Line
                                            key={s.userId}
                                            type="monotoneX"
                                            dataKey={(r: CompareRow) => r.values[i]}
                                            name={labels[i]}
                                            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                                            strokeWidth={1.75}
                                            dot={false}
                                            activeDot={{ r: 4, strokeWidth: 0 }}
                                            connectNulls
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        )}

                        {/* 사람별 요약 — 기간 필터와 무관하게 항상 최신 스냅샷 기준 */}
                        <div className="mt-4 divide-y divide-border">
                            {series.map((s, i) => {
                                const last = s.points[s.points.length - 1]
                                return (
                                    <div key={s.userId} className="flex items-center justify-between gap-3 py-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                                            <span className="text-sm font-semibold text-foreground truncate">{labels[i]}</span>
                                        </div>
                                        {last ? (
                                            <div className="flex items-baseline gap-3 shrink-0 numeric text-sm">
                                                <span className={cn('font-bold', last.profitRate >= 0 ? 'text-profit' : 'text-loss')}>
                                                    {last.profitRate >= 0 ? '+' : ''}{last.profitRate.toFixed(2)}%
                                                </span>
                                                <span className="text-foreground">
                                                    {formatCurrency(last.totalAsset / assetDivisor, baseCurrency)}
                                                </span>
                                                <span className="text-[0.6875rem] text-muted-foreground">
                                                    {language === 'ko'
                                                        ? `${formatDate(last.date, 'MM.dd')} 기준`
                                                        : `as of ${formatDate(last.date, 'MM.dd')}`}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">
                                                {language === 'ko' ? '스냅샷 없음' : 'No snapshots'}
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
```

- [ ] **Step 3: 서버 페이지 작성** — `app/dashboard/compare/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getPortfolioContext, listManagedPortfolios } from '@/lib/portfolio-context'
import { snapshotService } from '@/lib/services/snapshot-service'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { CompareChart, type CompareSeries } from '@/components/dashboard/compare-chart'

export const dynamic = 'force-dynamic'

// 나 vs 위임으로 관리 중인 포트폴리오의 추이 비교.
// 앱에서 유일하게 한 요청에서 두 사람 데이터를 읽는 경로 — 대상은 클라이언트 입력(쿠키/쿼리)이 아니라
// grant(grantee=나) 로만 정한다. ctx.portfolioUserId(active_portfolio 쿠키)는 의도적으로 쓰지 않는다
// → 관리 중이어도 화면은 항상 "나 vs grant 대상".
export default async function ComparePage() {
    const ctx = await getPortfolioContext()
    if (!ctx) {
        redirect('/auth/signin')
    }

    const managed = await listManagedPortfolios(ctx.actorId)
    if (managed.length === 0) {
        redirect('/dashboard/more')
    }

    const targets = [
        { userId: ctx.actorId, name: null, isSelf: true },
        ...managed.map((m) => ({ userId: m.ownerId, name: m.name, isSelf: false })),
    ]
    const [exchangeRate, pointsList] = await Promise.all([
        getUsdExchangeRate(),
        Promise.all(targets.map((t) => snapshotService.getChartData(t.userId))),
    ])
    const series: CompareSeries[] = targets.map((t, i) => ({ ...t, points: pointsList[i] }))

    return <CompareChart series={series} exchangeRate={exchangeRate} />
}
```

- [ ] **Step 4: 로딩 스켈레톤** — `app/dashboard/compare/loading.tsx`

```tsx
import { GenericPageSkeleton } from '@/components/ui/generic-page-skeleton'

export default function CompareLoading() {
    return <GenericPageSkeleton />
}
```

- [ ] **Step 5: 타입·린트**

Run: `npx tsc --noEmit -p . && npx eslint app/dashboard/compare components/dashboard/compare-chart.tsx lib/i18n/translations.ts`
Expected: 출력 없음(에러 0). `targets` 의 `name: null` 이 `string | null` 로 넓혀지지 않아 타입 에러가 나면 `name: null as string | null` 로 고정.

- [ ] **Step 6: dev 서버 확인** — 이미 떠 있으면 재사용, 아니면 `npm run dev` (background). 로컬은 `.env.development.local` → 로컬 PG.

- [ ] **Step 7: 로컬 grant 현황 확인 (아직 없어야 함)**

Run: `npx dotenv -e .env.development.local -- npx tsx scripts/grant-portfolio-access.ts --list`
Expected: `(등록된 위임 grant 가 없습니다)`

- [ ] **Step 8: Review Focus 3 — grant 없을 때 직접 접근은 리다이렉트**

cmux 브라우저(로컬 로그인 계정 = spungs `cmj2m7gp3000029t9lvyybbyq`)에서:
```bash
cmux browser --surface <surface> navigate http://localhost:3000/dashboard/compare
cmux browser --surface <surface> eval "location.pathname"
```
Expected: `/dashboard/more`

- [ ] **Step 9: 로컬 grant 생성 후 Review Focus 1 — 상대 스냅샷 0개**

Run: `npx dotenv -e .env.development.local -- npx tsx scripts/grant-portfolio-access.ts --owner-id cmonw9a5u000004jxmq5ta61z --grantee-id cmj2m7gp3000029t9lvyybbyq`
(로컬 여자친구 계정은 스냅샷 0개)

`/dashboard/compare` 접속 → Expected: '나' 보라 선 1개만, 요약 줄 두 번째에 `고성희  스냅샷 없음`, 콘솔 에러 없음.

- [ ] **Step 10: 로컬 전용 비교용 스냅샷 시딩** — 임시 스크립트 `scripts/.tmp-compare/seed.ts` (검증 후 삭제)

```ts
import { prisma } from '../../lib/prisma'

// 로컬 PG 전용 — 내 최근 스냅샷 날짜를 따라 상대 계정에 헤더만 있는 가짜 스냅샷을 만든다.
// 3개 중 1개는 건너뛰어 날짜 결측(connectNulls)도 확인. note 마커로 정리.
const OWNER = 'cmonw9a5u000004jxmq5ta61z'
const ME = 'cmj2m7gp3000029t9lvyybbyq'
const MARK = '__compare_test__'

async function main() {
    if (process.argv.includes('--cleanup')) {
        const r = await prisma.portfolioSnapshot.deleteMany({ where: { userId: OWNER, note: MARK } })
        console.log('deleted', r.count)
        return
    }
    const mine = await prisma.portfolioSnapshot.findMany({
        where: { userId: ME }, orderBy: { snapshotDate: 'desc' }, take: 120,
    })
    const data = mine.filter((_, i) => i % 3 !== 2).map((s) => ({
        userId: OWNER,
        snapshotDate: s.snapshotDate,
        totalValue: s.totalValue.times(0.4),
        totalCost: s.totalCost.times(0.4),
        totalProfit: s.totalProfit.times(0.4),
        profitRate: s.profitRate.times(0.6).plus(2),
        cashBalance: s.cashBalance.times(0.3),
        exchangeRate: s.exchangeRate,
        note: MARK,
    }))
    const r = await prisma.portfolioSnapshot.createMany({ data })
    console.log('created', r.count)
}
main().finally(() => prisma.$disconnect())
```

Run: `npx dotenv -e .env.development.local -- npx tsx scripts/.tmp-compare/seed.ts`
Expected: `created <N>` (N ≈ 72)

- [ ] **Step 11: 두 선·토글·기간·Review Focus 4 확인**

`/dashboard/compare` 새로고침 후 스냅샷 확인 (screenshot 전 `eval` 로 리페인트 — stale frame 회피):
- 보라(나)·주황(상대) 선 2개, 0% 점선, 결측일에도 주황 선이 끊기지 않음
- '자산' 토글 → Y축 억/만 포맷, 두 선 모두 표시
- 툴팁(hover) → 날짜 + 두 사람 값
- 요약 줄 2개: 수익률(색)·총자산·`MM.dd 기준`
- Review Focus 4: 로컬엔 내 스냅샷이 최근까지 있어 빈 기간을 재현할 수 없다 → Task 1 테스트(기간 밖 → `[]`) + 컴포넌트의 `rows.length === 0` 분기로 보장. 1M/6M/1Y/전체 전환 시 선이 기간에 맞게 바뀌는지만 확인.

- [ ] **Step 12: Review Focus 2 — 관리 중 상태에서도 '나' 고정**

헤더 프로필 스위처로 '고성희' 포트폴리오 전환(관리 배너 노출) → `/dashboard/compare` 접속.
Expected: 요약 첫 줄 `나` + 보라, 두 번째 `고성희` + 주황 (전환 전과 동일 값). 확인 후 스위처로 내 포트폴리오 복귀.

- [ ] **Step 13: Review Focus 5 — USD 표시 모드**

```bash
cmux browser --surface <surface> eval "localStorage.setItem('baseCurrency','USD'); location.reload(); 'ok'"
```
Expected: '자산' 모드 Y축 `$..K` 포맷, 요약 줄 총자산이 `$` 표기이고 (원화 값 ÷ 실환율)과 일치, 수익률 값은 KRW 모드와 동일. 확인 후 `localStorage.setItem('baseCurrency','KRW')` 로 복구.

---

### Task 3: '더보기' 진입점 (grant 있을 때만)

**Files:**
- Create: `app/dashboard/more/more-client.tsx`
- Modify: `app/dashboard/more/page.tsx` (전체 교체 — 기존 본문은 more-client.tsx 로 이동)
- Modify: `lib/i18n/translations.ts` (Task 2 에서 추가한 `moreCompareTitle` 다음 줄)

**Interfaces:**
- Consumes: `getPortfolioContext()`, `listManagedPortfolios(actorId)`, 번역 키 `moreCompareTitle` (Task 2)
- Produces: `MoreClient({ showCompare }: { showCompare: boolean })`, 번역 키 `moreGroupShared`, `moreCompareDesc`

- [ ] **Step 1: 번역 키 추가** — `lib/i18n/translations.ts`

ko 블록, `moreCompareTitle: '추이 비교',` 다음 줄에:

```ts
        moreCompareDesc: '나와 관리 중인 포트폴리오의 추이를 한 차트로',
        moreGroupShared: '함께 보기',
```

en 블록, `"moreCompareTitle": "Compare trends",` 다음 줄에:

```ts
        "moreCompareDesc": "Your trend and the managed portfolio on one chart",
        "moreGroupShared": "Shared",
```

- [ ] **Step 2: 클라이언트 본문 분리** — `app/dashboard/more/more-client.tsx`

기존 `app/dashboard/more/page.tsx` 내용을 그대로 옮기되 아래만 다르다:
컴포넌트 이름 `MorePage` → `MoreClient` (named export), `showCompare` prop, `Users` 아이콘 import, `COMPARE_GROUP` 상수, 렌더 시 `groups` 사용.

```tsx
'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/translations'
import { ChevronRight, TrendingUp, Sparkle, Settings, Wallet, Users } from 'lucide-react'

interface MoreItem {
    href: string
    titleKey: TranslationKey
    descKey?: TranslationKey
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}

interface MoreGroup {
    labelKey: TranslationKey
    items: MoreItem[]
}

const GROUPS: MoreGroup[] = [
    {
        labelKey: 'moreGroupTools',
        items: [
            { href: '/dashboard/simulation', titleKey: 'moreSimulationTitle', descKey: 'moreSimulationDesc', icon: TrendingUp },
            { href: '/dashboard/what-if', titleKey: 'moreWhatIfTitle', descKey: 'moreWhatIfDesc', icon: Sparkle },
        ],
    },
    {
        labelKey: 'moreGroupAccount',
        items: [
            { href: '/dashboard/accounts', titleKey: 'moreAccountsTitle', descKey: 'moreAccountsDesc', icon: Wallet },
            { href: '/dashboard/settings', titleKey: 'tabSettings', icon: Settings },
        ],
    },
]

// 위임 grant 를 받은 사용자(나)에게만 — 시뮬레이션 그룹 다음에 끼운다.
const COMPARE_GROUP: MoreGroup = {
    labelKey: 'moreGroupShared',
    items: [
        { href: '/dashboard/compare', titleKey: 'moreCompareTitle', descKey: 'moreCompareDesc', icon: Users },
    ],
}

export function MoreClient({ showCompare }: { showCompare: boolean }) {
    const { t } = useLanguage()
    const groups = showCompare ? [GROUPS[0], COMPARE_GROUP, ...GROUPS.slice(1)] : GROUPS

    return (
        <div className="max-w-[480px] md:max-w-2xl mx-auto w-full">
            <section className="px-6 pt-3 pb-4">
                <h1 className="hero-serif text-[2rem] text-foreground">
                    {t('tabMore')}
                </h1>
            </section>

            {groups.map((group) => (
                <div key={group.labelKey} className="mb-6">
                    <div className="eyebrow px-6 mb-2">{t(group.labelKey)}</div>
                    <div className="mx-4 bg-card rounded-2xl">
                        {group.items.map((item, i) => {
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-4 px-5 py-4 hover:bg-card-hover transition-colors min-h-[56px] ${i !== 0 ? 'border-t border-border' : ''}`}
                                >
                                    <div className="w-9 h-9 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                                        <Icon className="w-4 h-4 text-primary" strokeWidth={2} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-[0.9375rem] font-semibold text-foreground">
                                            {t(item.titleKey)}
                                        </div>
                                        {item.descKey && (
                                            <div className="text-[0.6875rem] text-muted-foreground mt-0.5">
                                                {t(item.descKey)}
                                            </div>
                                        )}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </Link>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
```

(그룹 JSX 는 기존 `page.tsx` 와 동일 — 픽셀 보존. 차이는 `GROUPS.map` → `groups.map` 뿐)

- [ ] **Step 3: 서버 껍데기로 교체** — `app/dashboard/more/page.tsx` 전체를 아래로 교체

```tsx
import { getPortfolioContext, listManagedPortfolios } from '@/lib/portfolio-context'
import { MoreClient } from './more-client'

// '추이 비교' 항목은 위임 grant 를 받은 사용자(나)에게만 노출 — 일반 사용자는 화면 무변화.
export default async function MorePage() {
    const ctx = await getPortfolioContext()
    const managed = ctx ? await listManagedPortfolios(ctx.actorId) : []
    return <MoreClient showCompare={managed.length > 0} />
}
```

- [ ] **Step 4: 타입·린트**

Run: `npx tsc --noEmit -p . && npx eslint app/dashboard/more lib/i18n/translations.ts`
Expected: 출력 없음(에러 0)

- [ ] **Step 5: grant 있을 때 메뉴 노출·진입**

`/dashboard/more` → Expected: '시뮬레이션' 그룹 아래 '함께 보기' 그룹, 항목 `추이 비교` / `나와 관리 중인 포트폴리오의 추이를 한 차트로`. 클릭 → `/dashboard/compare` 로 이동해 차트 표시.

- [ ] **Step 6: 로컬 검증 데이터 정리 + grant 없을 때 메뉴 미노출**

```bash
npx dotenv -e .env.development.local -- npx tsx scripts/.tmp-compare/seed.ts --cleanup
rm -rf scripts/.tmp-compare
npx dotenv -e .env.development.local -- npx tsx scripts/grant-portfolio-access.ts --revoke --owner-id cmonw9a5u000004jxmq5ta61z --grantee-id cmj2m7gp3000029t9lvyybbyq
```
Expected: `deleted <N>` (Step 10 의 N 과 동일), revoke 성공.
`/dashboard/more` 새로고침 → '함께 보기' 그룹 없음, 기존과 동일한 2개 그룹.
`git status` 에 `scripts/.tmp-compare` 가 남아 있지 않은지 확인.

---

### Task 4: 풀빌드 검증 + 문서 갱신 + 커밋 확인

**Files:**
- Modify: `plan.md` (최종 업데이트 날짜, 해당 기능 기록 — 계좌별 종목 수 표시 포함)
- Modify: `docs/superpowers/specs/2026-10-18-portfolio-compare-design.md` (상태: 구현 완료)

- [ ] **Step 1: 단위 테스트 재실행**

Run: `npx tsx --test lib/utils/compare-series.test.ts`
Expected: `# pass 6`, `# fail 0`

- [ ] **Step 2: 풀빌드** — dev 서버를 먼저 종료한 뒤 (`.next` 공유 충돌 방지)

Run: `npm run build`
Expected: 빌드 성공, 라우트 목록에 `/dashboard/compare` 포함.
빌드 후 `rm -rf .next` (cmux 에서 프로덕션 빌드 산출물이 dev 하이드레이션을 깨뜨림).

- [ ] **Step 3: 문서 갱신** — `plan.md` 상단 최종 업데이트 날짜를 2026-10-18 로, 최근 변경 기록에 두 항목 추가:
  - 보유 화면 계좌별 종목 수 표시 (필터 칩 숫자 + 계좌 그룹 헤더 `계좌명 · N`)
  - 추이 비교 화면 `/dashboard/compare` (grant 기반 접근, 수익률/자산 토글, 더보기 '함께 보기' 그룹)
  스펙 문서 상태 줄을 `구현 완료 (2026-10-18)` 로.

- [ ] **Step 4: 커밋 여부 사용자 확인** — 변경 요약을 보고하고 커밋/푸시 승인을 받는다. 승인 시 커밋 메시지 예:
  - `feat(portfolio): 보유 화면에 계좌별 종목 수 표시`
  - `feat(compare): 나와 관리 중인 포트폴리오의 추이 비교 화면 추가`
  - `docs: plan.md에 계좌별 종목 수·추이 비교 기록`
  (Co-Authored-By 등 자동 생성 문구 금지)
