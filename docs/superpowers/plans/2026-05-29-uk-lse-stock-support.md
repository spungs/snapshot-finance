# 영국(LSE) USD 종목 지원 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KIS가 시세를 제공하지 않는 영국(LSE) USD-표시 종목(예: HIM3 = Leverage Shares 3x Long HIMS ETP)을 등록·시세 조회·평가 가능하게 한다.

**Architecture:** 통화가 USD라서 기존 USD 흐름을 그대로 재사용한다(다통화 작업 없음). 두 무료 소스를 추가한다 — 종목 메타(이름/통화)는 **Twelve Data `symbol_search`**(무료), 시세(전일종가)는 **stooq CSV**(무료, 키 불필요). KIS 마스터(`stocks` 테이블)에 없는 LSE 종목은 검색 시 Twelve Data로 찾아 `stocks`에 `market='LSE'`로 동적 등록(upsert)하고, 시세 조회는 `market='LSE'`일 때 stooq로 분기한다.

**Tech Stack:** Next.js 16 · Prisma · stooq CSV API · Twelve Data REST(`/symbol_search`) · 기존 KIS/Yahoo 인프라.

**참고:**
- stooq 전일종가: `https://stooq.com/q/l/?s={ticker}.uk&f=sd2t2ohlcvn&h&e=csv` → CSV 헤더 `Symbol,Date,Time,Open,High,Low,Close,Volume,Name`, `Close`가 전일 종가
- Twelve Data 검색: `https://api.twelvedata.com/symbol_search?symbol={q}` (키 불필요) → `{data:[{symbol, instrument_name, exchange, mic_code, currency, country, instrument_type}]}`. `exchange==='LSE'` + `currency==='USD'` 필터
- Twelve Data `/quote`,`/price`는 LSE 유료라 **시세는 stooq만** 사용. Twelve Data는 검색(메타)에만.
- env `TWELVE_DATA_API_KEY` 는 이미 `.env.development.local` 에 추가됨 (symbol_search 는 키 없이도 동작하지만 일관성 위해 사용)

**테스트 정책:** 테스트 프레임워크 없음(CLAUDE.md). 각 task는 type-check + 수동 검증(curl/tsx).

---

## 파일 구조

### 신규
| 파일 | 책임 |
|---|---|
| `lib/api/stooq.ts` | stooq CSV 전일종가 조회 — `getStooqDailyClose(ticker)` |
| `lib/api/twelve-data.ts` | Twelve Data symbol_search — `searchLseUsdStocks(query)` |
| `lib/services/stock-resolver.ts` | KIS 마스터에 없는 LSE 종목을 Twelve Data로 찾아 `stocks` upsert — `resolveOrCreateStock(identifier)` (벌크/AI/등록 공통) |

### 수정
| 파일 | 변경 |
|---|---|
| `app/actions/admin-actions.ts` | `getCurrencyForMarket` 에 LSE→USD; `analyzeBulkImport` 에 LSE 폴백 |
| `lib/services/holding-service.ts` | `fetchCurrentPrice` 에 market='LSE' → stooq 분기 |
| `app/api/stocks/route.ts` | POST 에서 마스터 미스 시 `resolveOrCreateStock` 으로 LSE 등록 |
| `app/api/stocks/search/route.ts` | KIS 미스 시 Twelve Data LSE 결과 포함 |
| `app/api/holdings/route.ts` + `app/actions/holding-actions.ts` | market='LSE' → currency 'USD' |
| `app/api/ai/portfolio/route.ts` | `searchKisMaster` 미스 시 LSE 폴백 |
| `app/api/cron/update-prices/route.ts` | LSE 종목 stooq 가격 워밍 |

### 건드리지 않음
- 통화/환율/환산/스냅샷/UI (USD라 기존 흐름 재사용)
- prisma schema (currency/market 는 free String, 마이그레이션 불필요)

---

## Phase 1 — 등록 + 시세 (HIM3 바로 사용 가능)

## Task 1: stooq 전일종가 클라이언트

**Files:**
- Create: `lib/api/stooq.ts`

- [ ] **Step 1: 파일 작성**

```ts
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

    try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return null
        const text = await res.text()
        const lines = text.trim().split('\n')
        if (lines.length < 2) return null

        // 헤더: Symbol,Date,Time,Open,High,Low,Close,Volume,Name
        const cols = lines[1].split(',')
        if (cols.length < 9) return null

        const date = cols[1]
        const close = parseFloat(cols[6])
        const name = cols[8] ?? ''

        // 데이터 없는 종목은 Close 가 'N/D'
        if (date === 'N/D' || !Number.isFinite(close) || close <= 0) return null

        return { close, date, name }
    } catch (e) {
        console.warn(`[stooq] failed for ${ticker}:`, e)
        return null
    }
}
```

- [ ] **Step 2: 수동 검증**

Run:
```bash
npx tsx -e "import { getStooqDailyClose } from './lib/api/stooq'; getStooqDailyClose('HIM3').then(r => console.log(JSON.stringify(r)))"
```
Expected: `{"close":51.92,"date":"2026-05-28","name":"LEVERAGE SHARES"}` 형태 (날짜·값은 최신). null 아님.

- [ ] **Step 3: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/api/stooq.ts
git commit -m "feat(api): stooq 전일종가 클라이언트 (LSE 종목 무료 시세)"
```

---

## Task 2: Twelve Data symbol_search 클라이언트

**Files:**
- Create: `lib/api/twelve-data.ts`

- [ ] **Step 1: 파일 작성**

```ts
// Twelve Data symbol_search — 종목 메타(이름/통화/거래소) 조회.
// LSE 의 USD-표시 종목만 필터해 반환. 시세(/quote,/price)는 LSE 유료라 사용 안 함(stooq 사용).
// symbol_search 는 무료 + 키 불필요하지만, 키가 있으면 함께 전송.

const TD_BASE = 'https://api.twelvedata.com/symbol_search'

export type TwelveDataMatch = {
    symbol: string
    name: string
    exchange: string
    micCode: string
    currency: string
}

/**
 * Twelve Data 에서 LSE / USD 종목 검색.
 * @param query ticker 또는 이름 (예: 'HIM3')
 * @returns LSE 거래소 + USD 통화 매치 목록 (없으면 빈 배열)
 */
export async function searchLseUsdStocks(query: string): Promise<TwelveDataMatch[]> {
    const q = query.trim()
    if (!q) return []
    const key = process.env.TWELVE_DATA_API_KEY
    const url = `${TD_BASE}?symbol=${encodeURIComponent(q)}${key ? `&apikey=${key}` : ''}`

    try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return []
        const body = await res.json() as { data?: unknown }
        const data = Array.isArray(body.data) ? body.data : []

        return data
            .map((d) => d as Record<string, unknown>)
            .filter((d) => d.exchange === 'LSE' && d.currency === 'USD')
            .map((d) => ({
                symbol: String(d.symbol ?? ''),
                name: String(d.instrument_name ?? d.symbol ?? ''),
                exchange: String(d.exchange ?? 'LSE'),
                micCode: String(d.mic_code ?? 'XLON'),
                currency: String(d.currency ?? 'USD'),
            }))
            .filter((m) => m.symbol.length > 0)
    } catch (e) {
        console.warn(`[twelve-data] search failed for ${query}:`, e)
        return []
    }
}
```

- [ ] **Step 2: 수동 검증**

Run:
```bash
npx tsx -e "import { searchLseUsdStocks } from './lib/api/twelve-data'; searchLseUsdStocks('HIM3').then(r => console.log(JSON.stringify(r)))"
```
Expected: `[{"symbol":"HIM3","name":"Leverage Shares 3x Long Hims & Hers Health ...","exchange":"LSE","micCode":"XLON","currency":"USD"}]`

- [ ] **Step 3: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/api/twelve-data.ts
git commit -m "feat(api): Twelve Data symbol_search 클라이언트 (LSE USD 종목 메타)"
```

---

## Task 3: stock-resolver 공통 헬퍼

KIS 마스터에 없는 LSE 종목을 Twelve Data 로 찾아 `stocks` 에 동적 등록. 벌크/AI/등록 진입점이 공통 사용.

**Files:**
- Create: `lib/services/stock-resolver.ts`

- [ ] **Step 1: 파일 작성**

```ts
import { prisma } from '@/lib/prisma'
import { searchLseUsdStocks } from '@/lib/api/twelve-data'

type ResolvedStock = {
    stockCode: string
    nameKo: string
    nameEn: string | null
    market: string
}

/**
 * 종목 식별자(ticker/이름)를 stocks 마스터에서 찾고, 없으면 LSE(Twelve Data)에서 찾아 upsert.
 *
 * 우선순위:
 *  1) stocks 마스터 정확 매칭(stockCode/nameEn) — KIS(한/미) 종목
 *  2) stocks 마스터 한글명 매칭
 *  3) Twelve Data LSE/USD 검색 → stocks 에 market='LSE' 로 upsert → 반환
 *
 * @returns 매칭/생성된 Stock, 못 찾으면 null
 */
export async function resolveOrCreateStock(identifier: string): Promise<ResolvedStock | null> {
    const clean = identifier.trim()
    if (!clean) return null

    // 1) stockCode / nameEn 정확 매칭
    let stock = await prisma.stock.findFirst({
        where: {
            OR: [
                { stockCode: clean },
                { nameEn: { equals: clean, mode: 'insensitive' } },
            ],
        },
        select: { stockCode: true, nameKo: true, nameEn: true, market: true },
    })
    if (stock) return stock

    // 2) 한글명 매칭
    stock = await prisma.stock.findFirst({
        where: {
            OR: [
                { nameKo: clean },
                { nameKo: { contains: clean } },
            ],
        },
        select: { stockCode: true, nameKo: true, nameEn: true, market: true },
    })
    if (stock) return stock

    // 3) LSE(Twelve Data) 검색 — ticker 형태(영문/숫자)만 시도해 noise 차단
    if (!/^[A-Za-z0-9.]{1,12}$/.test(clean)) return null
    const matches = await searchLseUsdStocks(clean)
    // symbol 정확 일치 우선
    const hit = matches.find((m) => m.symbol.toUpperCase() === clean.toUpperCase()) ?? matches[0]
    if (!hit) return null

    // stocks 에 동적 등록 (LSE / USD). updatedAt 자동.
    const created = await prisma.stock.upsert({
        where: { stockCode: hit.symbol },
        update: { nameKo: hit.name, nameEn: hit.name, market: 'LSE' },
        create: { stockCode: hit.symbol, nameKo: hit.name, nameEn: hit.name, market: 'LSE' },
        select: { stockCode: true, nameKo: true, nameEn: true, market: true },
    })
    return created
}
```

- [ ] **Step 2: 수동 검증**

dev DB 에서 HIM3 가 stocks 에 없는 상태로:
```bash
npx tsx -e "import { resolveOrCreateStock } from './lib/services/stock-resolver'; resolveOrCreateStock('HIM3').then(r => console.log(JSON.stringify(r)))"
```
Expected: `{"stockCode":"HIM3","nameKo":"Leverage Shares ...","nameEn":"...","market":"LSE"}` — 그리고 stocks 테이블에 HIM3 row 생성됨.

- [ ] **Step 3: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/services/stock-resolver.ts
git commit -m "feat(service): LSE 종목 동적 등록 공통 헬퍼 resolveOrCreateStock"
```

---

## Task 4: currency 매핑 — LSE → USD

`getCurrencyForMarket` 및 holding 등록 경로에서 market='LSE' → 'USD'.

**Files:**
- Modify: `app/actions/admin-actions.ts` (getCurrencyForMarket)
- Modify: `app/api/holdings/route.ts`
- Modify: `app/actions/holding-actions.ts`

- [ ] **Step 1: `getCurrencyForMarket` 에 LSE 추가**

`app/actions/admin-actions.ts` 의 `getCurrencyForMarket` 함수에서 `US_MARKETS` 분기 옆에 LSE 추가:

```ts
function getCurrencyForMarket(market?: string | null, stockCode?: string): string {
    if (market) {
        const cleanMarket = market.toUpperCase().trim()
        const US_MARKETS = ['NAS', 'NYS', 'AMS', 'NASD', 'NYSE', 'AMEX']
        if (US_MARKETS.includes(cleanMarket)) return 'USD'
        // LSE 종목은 USD-표시 라인만 지원 (stooq/Twelve Data USD). GBP/GBX 미지원.
        if (cleanMarket === 'LSE') return 'USD'
    }

    if (stockCode) {
        const isUSCode = /^[A-Z]{1,5}$/i.test(stockCode)
        const isKoreanCode = /^\d{6}$/.test(stockCode)
        if (isUSCode) return 'USD'
        if (isKoreanCode) return 'KRW'
    }
    return 'KRW'
}
```

> 기존 `US_MARKETS` 에 `'NASD','NYSE','AMEX'` 가 없었다면 함께 추가(일관). 이미 있으면 LSE 한 줄만.

- [ ] **Step 2: `app/api/holdings/route.ts` 의 market→currency 매핑에 LSE 추가**

해당 파일에서 currency 미전달 시 market 으로 결정하는 블록(대략 L178-189). `['US','NAS','NYS','AMS','NASD','NYSE','AMEX']` 목록에 `'LSE'` 추가:

```ts
const usdMarkets = ['US', 'NAS', 'NYS', 'AMS', 'NASD', 'NYSE', 'AMEX', 'LSE']
const currency = usdMarkets.includes(stock.market) ? 'USD' : 'KRW'
```
(현재 코드의 배열/조건 형태에 맞춰 'LSE' 만 추가. 실제 변수명은 파일 확인.)

- [ ] **Step 3: `app/actions/holding-actions.ts` 동일 매핑에 LSE 추가** (대략 L104-113, 위와 같은 패턴)

- [ ] **Step 4: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add app/actions/admin-actions.ts app/api/holdings/route.ts app/actions/holding-actions.ts
git commit -m "feat(api): LSE market → USD currency 매핑 추가"
```

---

## Task 5: 시세 폴백 — LSE 종목은 stooq

`holding-service.fetchCurrentPrice` 에서 market='LSE'면 KIS 대신 stooq.

**Files:**
- Modify: `lib/services/holding-service.ts` (fetchCurrentPrice, L16-46)

- [ ] **Step 1: fetchCurrentPrice 에 LSE 분기 추가**

기존 함수 body 의 try 블록 시작부에 LSE 분기를 KIS 호출보다 먼저 둔다:

```ts
async function fetchCurrentPrice(stockCode: string, market: string): Promise<number> {
    const cached = await cacheGet<PriceCacheEntry>(stockPriceKey(stockCode))
    if (cached && Number.isFinite(cached.price) && cached.price > 0) {
        return cached.price
    }

    // LSE 종목: KIS 미지원 → stooq 전일종가 (USD).
    if (market === 'LSE') {
        try {
            const { getStooqDailyClose } = await import('@/lib/api/stooq')
            const quote = await getStooqDailyClose(stockCode)
            if (quote && Number.isFinite(quote.close) && quote.close > 0) {
                const entry: PriceCacheEntry = {
                    price: quote.close,
                    currency: 'USD',
                    change: 0,
                    changeRate: 0,
                    updatedAt: new Date().toISOString(),
                }
                await cacheSet(stockPriceKey(stockCode), entry, PRICE_CACHE_TTL_SECONDS)
                return quote.close
            }
            return 0
        } catch (e) {
            console.warn(`[holding-service] stooq failed for ${stockCode}:`, e)
            return 0
        }
    }

    try {
        let marketType: 'KOSPI' | 'KOSDAQ' | 'US' = 'KOSPI'
        if (market === 'US' || market === 'NAS' || market === 'NYS' || market === 'AMS') {
            marketType = 'US'
        } else if (market === 'KOSDAQ' || market === 'KQ') {
            marketType = 'KOSDAQ'
        }

        const priceData = await kisClient.getCurrentPrice(stockCode, marketType)
        if (Number.isFinite(priceData.price) && priceData.price > 0) {
            const entry: PriceCacheEntry = {
                price: priceData.price,
                currency: marketType === 'US' ? 'USD' : 'KRW',
                change: priceData.change ?? 0,
                changeRate: priceData.changeRate ?? 0,
                updatedAt: new Date().toISOString(),
            }
            await cacheSet(stockPriceKey(stockCode), entry, PRICE_CACHE_TTL_SECONDS)
        }
        return priceData.price
    } catch (e) {
        console.warn(`Failed to fetch price for ${stockCode}:`, e)
        return 0
    }
}
```

> `import('@/lib/api/stooq')` 동적 import — KIS 종목만 쓰는 일반 경로에 stooq 모듈 로드 부담을 주지 않기 위함(선택). 정적 import 로 상단에 둬도 무방.

- [ ] **Step 2: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/services/holding-service.ts
git commit -m "feat(service): LSE 종목 시세를 stooq 전일종가로 조회 (KIS 미지원 폴백)"
```

---

## Task 6: 종목 등록·검색에 LSE 진입로

개별 추가(검색→선택→등록)에서 LSE 종목 등록 가능하게.

**Files:**
- Modify: `app/api/stocks/route.ts` (POST)
- Modify: `app/api/stocks/search/route.ts`

- [ ] **Step 1: `app/api/stocks/route.ts` POST — 마스터 미스 시 LSE 등록**

기존 POST 의 `existing` 미스 시 404 부분을 `resolveOrCreateStock` 으로 교체:

```ts
import { resolveOrCreateStock } from '@/lib/services/stock-resolver'
// ...
    const existing = await prisma.stock.findUnique({ where: { stockCode: trimmedCode } })
    if (existing) {
        return NextResponse.json({ success: true, data: existing })
    }

    // 마스터에 없으면 LSE(Twelve Data) 동적 등록 시도.
    const resolved = await resolveOrCreateStock(trimmedCode)
    if (resolved) {
        return NextResponse.json({ success: true, data: resolved })
    }

    return NextResponse.json(
        { success: false, error: { code: 'STOCK_NOT_FOUND', message: '종목을 찾을 수 없습니다.' } },
        { status: 404 },
    )
```

- [ ] **Step 2: `app/api/stocks/search/route.ts` — KIS 미스 시 Twelve Data LSE 결과 추가**

검색 결과가 비어있을 때(또는 DB/Yahoo/Finnhub 모두 미스 시) Twelve Data LSE 결과를 후보로 추가. 파일의 최종 결과 반환 직전에:

```ts
import { searchLseUsdStocks } from '@/lib/api/twelve-data'
// ...
// 기존 결과(results)가 비었으면 LSE(Twelve Data) 검색 추가.
if (results.length === 0) {
    const lse = await searchLseUsdStocks(query)
    for (const m of lse) {
        results.push({
            symbol: m.symbol,
            name: m.name,
            nameKo: m.name,
            nameEn: m.name,
            exchange: 'LSE',
            market: 'LSE',
            type: 'etf',
        })
    }
}
```
(실제 results 항목 shape 은 파일의 기존 타입에 맞춰 필드명 조정. market='LSE' 가 핵심.)

- [ ] **Step 3: 타입 체크 + 수동 검증**

```bash
npx tsc --noEmit
```
dev 서버에서 종목 검색에 'HIM3' 입력 → LSE 결과 노출 → 선택 → POST /api/stocks → stocks 등록 + holding 추가 가능 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/api/stocks/route.ts app/api/stocks/search/route.ts
git commit -m "feat(api): 종목 검색·등록에 LSE 종목 진입로 (Twelve Data + 동적 upsert)"
```

---

## Task 7: Phase 1 수동 검증 (개별 추가로 HIM3 등록)

**Files:** 없음 (검증)

- [ ] **Step 1: dev 서버 + 개별 추가 흐름**

```bash
npm run dev
```
포트폴리오 → 개별 종목 추가 → 검색 'HIM3' → LSE 결과 선택 → 수량·평단가($) 입력 → 등록.

- [ ] **Step 2: 확인 항목**

| 확인 | 기대 |
|---|---|
| 검색 'HIM3' | LSE 결과 1건 노출 |
| 등록 | holding 추가 성공 (currency USD) |
| 시세 | 보유 목록에 stooq 전일종가($) 표시 |
| 평가금액 | USD × 환율 KRW 환산 정상 (기존 USD 흐름) |
| 총자산 | HIM3 포함 정상 합산 |

> Phase 1 완료 시 HIM3 를 개별 추가로 등록·평가 가능. 벌크/AI 는 Phase 2.

---

## Phase 2 — 벌크 / AI 어시 / cron 진입점 확장

## Task 8: 벌크 일괄등록 LSE 폴백

`analyzeBulkImport` 가 KIS 마스터 미스 시 `resolveOrCreateStock` 으로 LSE 시도.

**Files:**
- Modify: `app/actions/admin-actions.ts` (analyzeBulkImport, L154-179)

- [ ] **Step 1: analyzeBulkImport 의 stock lookup 에 LSE 폴백**

기존 2단계 매칭(stockCode/nameEn → nameKo) 후 미스면 `resolveOrCreateStock`:

```ts
import { resolveOrCreateStock } from '@/lib/services/stock-resolver'
// ... for (const item of items) {
    const cleanIdentifier = item.identifier.trim()

    // 1) stockCode/nameEn 정확
    let stock = await prisma.stock.findFirst({
        where: { OR: [ { stockCode: cleanIdentifier }, { nameEn: { equals: cleanIdentifier, mode: 'insensitive' } } ] },
    })
    // 2) nameKo
    if (!stock) {
        stock = await prisma.stock.findFirst({
            where: { OR: [ { nameKo: cleanIdentifier }, { nameKo: { contains: cleanIdentifier } } ] },
        })
    }
    // 3) LSE(Twelve Data) 폴백 — stocks 에 upsert 후 다시 조회
    if (!stock) {
        const lse = await resolveOrCreateStock(cleanIdentifier)
        if (lse) {
            stock = await prisma.stock.findUnique({ where: { stockCode: lse.stockCode } })
        }
    }

    if (stock) {
        // ... 기존 resolved 처리 (getCurrencyForMarket 가 LSE→USD 반환)
    } else {
        // ... 기존 unresolved 처리
    }
```

> `getCurrencyForMarket(stock.market, ...)` 가 Task 4 에서 LSE→USD 반환하므로 환율 자동채움(USD) 흐름이 그대로 동작.

- [ ] **Step 2: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add app/actions/admin-actions.ts
git commit -m "feat(bulk-import): 일괄등록 LSE 종목 폴백 (resolveOrCreateStock)"
```

---

## Task 9: AI 어시스턴트 LSE 폴백

`searchKisMaster` 미스 시 LSE 등록.

**Files:**
- Modify: `app/api/ai/portfolio/route.ts` (add_holding 종목 보강 부분, L618-645)

- [ ] **Step 1: add_holding 종목 검색에 LSE 폴백 추가**

기존 `searchKisMaster` → `searchYahoo` 폴백 체인 뒤에 `resolveOrCreateStock` 추가:

```ts
import { resolveOrCreateStock } from '@/lib/services/stock-resolver'
// ... if (action.type === 'add_holding') {
    let hit = await searchKisMaster(action.stockName)
    if (!hit) hit = await searchYahoo(action.stockName)

    // LSE(Twelve Data) 폴백 — KIS/Yahoo 미스 시
    if (!hit) {
        const lse = await resolveOrCreateStock(action.stockName)
        if (lse) {
            hit = { officialName: lse.nameEn ?? lse.nameKo, market: 'LSE', currency: 'USD' }
        }
    }

    if (!hit) {
        return NextResponse.json({ success: true, action: null, reply: `'${action.stockName}'을(를) 찾을 수 없습니다. 정확한 종목명을 알려주세요.` })
    }
    action.stockOfficialName = hit.officialName
    action.stockMarket = hit.market
    action.currency = hit.currency
    // USD 면 환율 계산 — 기존 블록 그대로 (LSE 도 USD 라 동일 동작)
    // ...
}
```

> `KisSearchHit` 타입의 currency 가 `'KRW'|'USD'` 라 LSE→'USD' 그대로 호환. `action.currency='USD'` 면 기존 USD 환율 계산(estimatedTotalKrw) 정상 동작.

- [ ] **Step 2: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add app/api/ai/portfolio/route.ts
git commit -m "feat(ai): AI 어시스턴트 LSE 종목 폴백 (resolveOrCreateStock)"
```

---

## Task 10: cron 가격 워밍에 LSE 포함

`update-prices` 가 LSE 종목을 stooq 로 워밍.

**Files:**
- Modify: `app/api/cron/update-prices/route.ts`

- [ ] **Step 1: LSE 종목 워밍 분기 추가**

cron 핸들러에서 보유 종목 중 market='LSE' 인 것을 모아 stooq 로 가격 조회 후 캐시:

```ts
import { getStooqDailyClose } from '@/lib/api/stooq'
import { cacheSet, stockPriceKey, PRICE_CACHE_TTL_SECONDS, type PriceCacheEntry } from '@/lib/cache'
// ... 기존 KR/US 워밍 후, LSE 종목 처리 추가:

// LSE 종목 — stooq 전일종가 워밍 (rate limit 고려해 순차 + 짧은 간격)
const lseStocks = await prisma.stock.findMany({
    where: { market: 'LSE' },
    select: { stockCode: true },
})
for (const s of lseStocks) {
    const quote = await getStooqDailyClose(s.stockCode)
    if (quote && quote.close > 0) {
        const entry: PriceCacheEntry = {
            price: quote.close, currency: 'USD', change: 0, changeRate: 0,
            updatedAt: new Date().toISOString(),
        }
        await cacheSet(stockPriceKey(s.stockCode), entry, PRICE_CACHE_TTL_SECONDS)
    }
    await new Promise(r => setTimeout(r, 300)) // stooq 과다 호출 방지
}
```

> `parseMarketParam`/`marketFilter` 가 'US'/'KR' 만 받으므로, LSE 워밍은 별도 무조건 실행하거나 `market=GB` 파라미터를 추가. 가장 단순한 안: 매 cron 실행 시 LSE 종목도 함께 워밍(수 적음). pg_cron 스케줄 변경 불필요.

- [ ] **Step 2: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add app/api/cron/update-prices/route.ts
git commit -m "feat(cron): LSE 종목 stooq 가격 워밍 추가"
```

---

## Task 11: Phase 2 수동 검증

**Files:** 없음

- [ ] **Step 1: 벌크 검증** — 일괄등록(텍스트/이미지)에 'HIM3' 포함 → LSE 매칭 → 등록
- [ ] **Step 2: AI 어시 검증** — "HIM3 10주 51달러에 추가" → LSE 매칭 → 카드 등록
- [ ] **Step 3: cron 검증** — `curl http://localhost:3000/api/cron/update-prices` → LSE 종목 캐시 갱신 확인
- [ ] **Step 4: 빌드** — `npm run build` 통과

---

## Self-Review Notes

1. **Spec coverage:** stooq 시세(Task1·5·10), Twelve Data 메타(Task2), 동적 등록(Task3·6), currency USD(Task4), 벌크(Task8), AI(Task9) — 진입점 모두 매핑.
2. **Placeholder:** 신규 3파일(stooq/twelve-data/resolver)은 완전 코드. 수정 task 는 기존 코드 인접 위치 + 변경 코드 명시. 일부 "파일 확인 후 변수명 조정" 가이드는 기존 코드 형태가 파일마다 미세하게 달라 불가피 — 핵심 로직(LSE→USD, resolveOrCreateStock 호출)은 명확.
3. **Type consistency:** `resolveOrCreateStock` 반환 `{stockCode,nameKo,nameEn,market}` 일관. `getStooqDailyClose` → `{close,date,name}`. `searchLseUsdStocks` → `{symbol,name,exchange,micCode,currency}`. 진입점들이 동일 시그니처 사용.

## 비스코프
- GBP/GBX-표시 LSE 종목 (USD 라인만)
- 실시간 시세 (stooq 전일종가만)
- 스냅샷 다통화 (USD라 단일 환율 필드 재사용)
- LSE 외 거래소(Euronext/Milan 등)

## 다음 단계
Phase 1(Task 1-7)만으로 HIM3 개별 등록·시세·평가 가능. Phase 2(Task 8-11)는 벌크/AI 진입점 확장. subagent-driven-development 로 task 단위 실행 권장.
