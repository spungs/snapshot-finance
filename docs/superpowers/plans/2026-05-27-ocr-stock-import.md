# OCR 종목 일괄 등록 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 증권사 잔고 캡쳐 이미지를 업로드하면 Gemini Vision이 종목을 추출하고, 사용자가 카드 리스트에서 검토·수정 후 한 번에 등록하는 OCR 입력 모드를 일괄등록 다이얼로그에 추가한다.

**Architecture:** 새로 만들 코드를 최소화한다. OCR은 입력 수단이고, 종목 매칭·계좌 매핑·USD 환율 자동채움·트랜잭션 롤백은 기존 `analyzeBulkImport` / `executeBulkImport`를 그대로 호출하여 재사용한다. 일괄등록 다이얼로그 안에 `📷 이미지` / `📋 텍스트` 모드 탭을 추가하여 사용자 진입점을 통일한다.

**Tech Stack:** Next.js 16 App Router · Gemini 2.5 Flash (`@google/generative-ai@^0.24.1`) · Upstash Rate Limit · NextAuth v5 · Prisma · sonner (toast) · Tailwind · shadcn/ui.

**참고 문서:** `docs/superpowers/specs/2026-05-27-ocr-stock-import-design.md` (spec).

**테스트 정책:** 프로젝트에 테스트 프레임워크가 없다(CLAUDE.md 명시). 자동 테스트 작성 대신 각 task에 type-check 및 수동 검증 step을 둔다.

---

## 파일 구조

### 신규 파일

| 파일 | 책임 |
|---|---|
| `lib/ai/ocr-prompt.ts` | Gemini Vision 시스템 프롬프트 텍스트 + `responseSchema` 객체 — 순수 데이터, side-effect 없음 |
| `app/api/ai/ocr-import/route.ts` | OCR API endpoint — PRO/admin 가드, rate limit, 이미지 검증, Gemini 호출, `analyzeBulkImport` 호출 |
| `components/dashboard/bulk-import-image-mode.tsx` | 이미지 입력 + 압축 + 분석 호출 + 카드 리스트 + inline edit + 확정 흐름 |

### 수정 파일

| 파일 | 변경 요지 |
|---|---|
| `lib/ratelimit.ts` | `ocr`(5/60s burst) + `ocrDaily`(10/1d) limiter 2개 추가 |
| `lib/i18n/translations.ts` | OCR 모드 관련 한·영 문구 추가 |
| `components/dashboard/bulk-import-dialog.tsx` | 모드 탭(📷 이미지 / 📋 텍스트) 도입. 기존 textarea 흐름을 텍스트 탭으로 캡슐화. 디폴트 = 📋 텍스트 |

### 건드리지 않는 것

- DB 스키마 (마이그레이션 없음)
- `app/actions/admin-actions.ts`의 `analyzeBulkImport` / `executeBulkImport`
- `holdingService`, KIS/Yahoo 검색
- `components/dashboard/stock-search-combobox.tsx`
- AI 어시스턴트 (`/api/ai/portfolio`, `ai-chat.tsx`)

---

## Task 1: Rate Limiter 추가

OCR 호출은 이미지 토큰 비용이 크므로 burst와 daily 두 단계 보호.

**Files:**
- Modify: `lib/ratelimit.ts`

- [ ] **Step 1: `lib/ratelimit.ts`에 `ocr` / `ocrDaily` limiter 추가**

`lib/ratelimit.ts`의 `ratelimit` 객체 안, `aiDaily` 항목 바로 아래에 다음 두 항목 추가:

```ts
    // OCR burst (Gemini Vision 단기 남용 방지): 5 요청 / 60초
    ocr: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        analytics: true,
        prefix: '@upstash/ratelimit/ocr',
    }),

    // OCR 일일 한도 (이미지 토큰 비용 통제): 10 요청 / 24시간 — 사용자별 (PRO 일일 한도)
    ocrDaily: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 d'),
        analytics: true,
        prefix: '@upstash/ratelimit/ocr-daily',
    }),
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건

- [ ] **Step 3: 커밋**

```bash
git add lib/ratelimit.ts
git commit -m "chore(ratelimit): OCR burst·daily limiter 추가

- ocr: 5/60s — 이미지 호출 단기 남용 방지
- ocrDaily: 10/24h — PRO 일일 호출 한도 (이미지 토큰 비용 통제)"
```

---

## Task 2: i18n 번역 키 추가

이미지 모드 UI에서 사용할 한·영 문구를 `portfolioManage` 섹션에 추가.

**Files:**
- Modify: `lib/i18n/translations.ts`

- [ ] **Step 1: 한국어 키 추가 (`portfolioManage` 섹션, 약 355번째 줄)**

기존 `portfolioManage` 한국어 객체의 마지막 항목 바로 위에 다음 키 추가 (콤마 위치 주의):

```ts
            // OCR (이미지 모드)
            ocrModeTab: '📷 이미지로',
            textModeTab: '📋 텍스트로',
            ocrProBadge: 'PRO',
            ocrUploadHint: '캡쳐 이미지를 드래그하거나 클릭 (PNG·JPG·WEBP, 최대 10MB)',
            ocrAnalyzing: '이미지 분석 중...',
            ocrEmptyResult: '이미지에서 종목을 찾지 못했어요. 다른 이미지를 시도해주세요.',
            ocrUnsupportedFormat: 'PNG·JPG·WEBP만 지원합니다. iPhone HEIC는 PNG로 저장해주세요.',
            ocrTooLarge: '이미지가 너무 큽니다 (최대 10MB).',
            ocrCompressFailed: '이미지 압축에 실패했습니다.',
            ocrAnalysisFailed: '이미지 분석에 실패했어요. 다시 시도해주세요.',
            ocrProOnly: 'OCR은 PRO 전용입니다.',
            ocrDailyLimit: '오늘의 이미지 인식 한도를 모두 사용했어요. 자정에 초기화됩니다.',
            ocrBurstLimit: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
            ocrThumbnailAlt: '업로드한 캡쳐 이미지',
            ocrChangeImage: '이미지 변경',
            ocrChangeImageConfirm: '카드 수정 사항이 사라집니다. 새 이미지로 분석할까요?',
            ocrAmbiguousHint: '종목 후보가 여러 개입니다. 정확한 종목을 선택해주세요.',
            ocrUnresolvedHint: '종목을 찾지 못했어요. 직접 검색해서 선택해주세요.',
            ocrRetry: '재시도',
            ocrSubmitButton: '{count}개 등록',
            ocrCountSummary: '인식 {total}개 · 확정 {ready}개',
```

- [ ] **Step 2: 영어 키 추가 (`portfolioManage` 영어 섹션, 약 847번째 줄)**

같은 패턴으로 영어 번역 추가:

```ts
            // OCR (image mode)
            ocrModeTab: '📷 Image',
            textModeTab: '📋 Text',
            ocrProBadge: 'PRO',
            ocrUploadHint: 'Drag or click to upload a screenshot (PNG·JPG·WEBP, max 10MB)',
            ocrAnalyzing: 'Analyzing image...',
            ocrEmptyResult: 'No holdings found in the image. Please try another one.',
            ocrUnsupportedFormat: 'Only PNG·JPG·WEBP are supported. Save iPhone HEIC as PNG.',
            ocrTooLarge: 'Image too large (max 10MB).',
            ocrCompressFailed: 'Image compression failed.',
            ocrAnalysisFailed: 'Image analysis failed. Please try again.',
            ocrProOnly: 'OCR is a PRO-only feature.',
            ocrDailyLimit: 'Daily image OCR limit reached. Resets at midnight.',
            ocrBurstLimit: 'Too many requests. Please wait a moment.',
            ocrThumbnailAlt: 'Uploaded screenshot',
            ocrChangeImage: 'Change image',
            ocrChangeImageConfirm: 'Your edits will be lost. Analyze the new image?',
            ocrAmbiguousHint: 'Multiple candidates matched. Please select the exact one.',
            ocrUnresolvedHint: 'Stock not found. Search manually.',
            ocrRetry: 'Retry',
            ocrSubmitButton: 'Register {count}',
            ocrCountSummary: '{total} detected · {ready} ready',
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건. 만약 `portfolioManage` 타입 정의가 한쪽(ko)을 source로 하고 다른 언어를 `typeof`로 추론한다면, 두 객체의 키 셋이 정확히 일치해야 통과.

- [ ] **Step 4: 커밋**

```bash
git add lib/i18n/translations.ts
git commit -m "feat(i18n): OCR 일괄 등록 모드용 한·영 번역 추가"
```

---

## Task 3: OCR 프롬프트 & 스키마 모듈

Gemini Vision 호출 시 사용할 시스템 프롬프트 문자열과 `responseSchema` 객체. 순수 데이터/상수 모듈이라 의존성 최소.

**Files:**
- Create: `lib/ai/ocr-prompt.ts`

- [ ] **Step 1: 디렉토리 + 파일 생성**

`lib/ai/` 디렉토리는 현재 없으므로 새로 생성됨 (`Write` 도구가 자동 처리).

`lib/ai/ocr-prompt.ts` 신규 작성:

```ts
import { SchemaType } from '@google/generative-ai'

/**
 * Gemini Vision 에 전달하는 OCR 시스템 프롬프트.
 * 한국 증권사 앱 잔고 캡쳐 도메인에 특화되어 있다.
 *
 * 규칙은 spec 8.3 절을 그대로 옮긴 것.
 * 모델이 자유 텍스트로 답하지 않고 responseSchema 에 맞춘 JSON 만 반환하도록 강제한다.
 */
export const OCR_SYSTEM_PROMPT = `당신은 한국 증권사 앱 잔고 캡쳐 이미지에서 보유 종목을 추출하는 도우미입니다.
사용자의 자산을 등록할 데이터이므로 추측하지 말고 캡쳐에 실제로 적힌 값만 추출하세요.

## 추출 대상
- stockName: 종목명(한글 또는 영문). 캡쳐에 적힌 표기 그대로. 임의 번역·표기 변경 금지.
- quantity: 보유 수량(주). 단위 "주" 제거, 숫자만.
- averagePrice: 평균 매수가(=평단). 단위("원","$","KRW","USD") 및 콤마(1,234,500) 제거, 숫자만.
- currency: 'KRW' 또는 'USD'. 한국 시장이면 KRW, 미국 시장이면 USD. 알 수 없으면 비워둠.
- purchaseRate: USD 종목 매입 시점 환율. 캡쳐에 환율 컬럼이 있을 때만 채움. 없으면 비워둠.

## 흔한 함정 (반드시 피할 것)
- "평가금액", "평가손익", "수익률", "현재가", "오늘 변동" 같은 컬럼은 절대 추출하지 마세요.
- 종목명 옆의 [ETF], [채권], [리츠] 같은 태그는 stockName 에 그대로 포함하세요.
- 캡쳐가 흐릿하거나 잘려서 값을 확신할 수 없으면 holdings 빈 배열을 반환하세요. 추측 금지.
- 헤더·요약·합계 줄은 추출하지 마세요. "총 평가금액", "총 손익" 등.

## 금지
- 자유 텍스트로 답하지 말 것. responseSchema 를 따르는 JSON 만.
- 수량 0, 음수, 평단가 0/음수 반환 금지. 그런 행은 추출에서 제외.
- 종목명 임의 번역(예: "Apple"을 "애플"로 바꾸기) 금지. 캡쳐 표기 그대로.

## 예시 (참고용, 절대 응답에 포함하지 말 것)
캡쳐: "삼성전자  100주  74,300원  +12.5%"
→ { stockName: "삼성전자", quantity: 100, averagePrice: 74300, currency: "KRW" }

캡쳐: "AAPL  5주  $234.5  매입환율 1,390"
→ { stockName: "AAPL", quantity: 5, averagePrice: 234.5, currency: "USD", purchaseRate: 1390 }
` as const

/**
 * Gemini structured output 강제용 responseSchema.
 * holdings 배열 한 필드만 반환. items 의 필수 필드는 stockName, quantity, averagePrice.
 */
export const OCR_RESPONSE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        holdings: {
            type: SchemaType.ARRAY,
            description: '이미지에서 인식한 보유 종목 목록',
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    stockName: { type: SchemaType.STRING, description: '종목명 (한글 또는 영문 그대로)' },
                    quantity: { type: SchemaType.NUMBER, description: '보유 수량 (주)' },
                    averagePrice: { type: SchemaType.NUMBER, description: '평균 매수가 (단위 없이 숫자만)' },
                    currency: {
                        type: SchemaType.STRING,
                        format: 'enum',
                        enum: ['KRW', 'USD'],
                        description: '통화. 모호하면 비워둠',
                    },
                    purchaseRate: {
                        type: SchemaType.NUMBER,
                        description: 'USD 매입 시점 환율. 캡쳐에 환율 컬럼이 있을 때만',
                    },
                },
                required: ['stockName', 'quantity', 'averagePrice'],
            },
        },
    },
    required: ['holdings'],
} as const

/** Gemini Vision 호출 응답을 strongly type 한다. */
export type OcrHoldingItem = {
    stockName: string
    quantity: number
    averagePrice: number
    currency?: 'KRW' | 'USD'
    purchaseRate?: number
}

export type OcrResponse = {
    holdings: OcrHoldingItem[]
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건. `SchemaType` 은 `@google/generative-ai@^0.24.1` 에 정의되어 있어 import 정상 동작.

- [ ] **Step 3: 커밋**

```bash
git add lib/ai/ocr-prompt.ts
git commit -m "feat(ai): Gemini Vision OCR 프롬프트·responseSchema 모듈

- 증권사 잔고 캡쳐 도메인 특화 시스템 프롬프트
- holdings 배열 structured output 강제 (자유 텍스트 차단)
- OcrHoldingItem / OcrResponse 타입 export"
```

---

## Task 4: OCR API Route

이미지 → Gemini → ImportItem 변환 → `analyzeBulkImport` 호출 → resolved/unresolved 응답.

**Files:**
- Create: `app/api/ai/ocr-import/route.ts`

- [ ] **Step 1: API route 생성**

`app/api/ai/ocr-import/route.ts` 신규 작성:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { auth } from '@/lib/auth'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'
import { isProUser } from '@/lib/billing/subscription'
import { OCR_SYSTEM_PROMPT, OCR_RESPONSE_SCHEMA, type OcrResponse } from '@/lib/ai/ocr-prompt'
import { analyzeBulkImport, type ImportItem } from '@/app/actions/admin-actions'

// Vercel function 콜드 스타트 + Gemini Vision 첫 호출 + analyzeBulkImport(KIS/Yahoo)
// 까지 60초 안에 끝나야 함. AI 어시 route 와 동일 정책.
export const maxDuration = 60

// payload 4MB 한계 (Vercel function body 4.5MB 안전 마진).
// base64 길이는 raw bytes 의 약 1.37 배이므로 이 한계는 raw ~3MB 에 해당.
const MAX_BASE64_BYTES = 4 * 1024 * 1024

const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY
if (!GOOGLE_AI_API_KEY) {
    console.warn('[ai/ocr-import] GOOGLE_AI_API_KEY is not set. OCR endpoint will return 503.')
}
const genAI = GOOGLE_AI_API_KEY ? new GoogleGenerativeAI(GOOGLE_AI_API_KEY) : null

type RequestBody = {
    imageBase64?: unknown
    mimeType?: unknown
}

export async function POST(request: NextRequest) {
    try {
        if (!genAI) {
            return NextResponse.json(
                { success: false, error: 'AI 어시스턴트가 설정되지 않았습니다. 관리자에게 문의해주세요.' },
                { status: 503 },
            )
        }

        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 })
        }

        // admin 은 비용/남용 우려 대상이 아니므로 burst/daily 모두 통과.
        const isAdmin = session.user.role === 'admin'

        // PRO 전용 가드 — UI 잠금 우회 방지용 서버 가드. admin 은 isProUser 안에서 통과.
        if (!(await isProUser(session.user.id))) {
            return NextResponse.json(
                { success: false, error: 'OCR은 PRO 플랜 전용 기능입니다.', code: 'PRO_REQUIRED' },
                { status: 403 },
            )
        }

        // 1) burst: 5회/분 — 단기 남용·동시 호출 차단
        const burstResult = isAdmin ? null : await checkRateLimit(ratelimit.ocr, session.user.id)
        if (burstResult && !burstResult.success) {
            return NextResponse.json(
                { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': burstResult.limit.toString(),
                        'X-RateLimit-Remaining': burstResult.remaining.toString(),
                        'X-RateLimit-Reset': burstResult.reset.toString(),
                    },
                },
            )
        }

        // 2) daily: 10회/24h — 일일 비용 한도. reset 은 epoch seconds.
        const dailyResult = isAdmin ? null : await checkRateLimit(ratelimit.ocrDaily, session.user.id)
        if (dailyResult && !dailyResult.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: '오늘의 이미지 인식 한도를 모두 사용했어요. 자정에 초기화됩니다.',
                    code: 'OCR_DAILY_LIMIT',
                    resetAt: dailyResult.reset,
                },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': dailyResult.limit.toString(),
                        'X-RateLimit-Remaining': dailyResult.remaining.toString(),
                        'X-RateLimit-Reset': dailyResult.reset.toString(),
                        'X-RateLimit-Scope': 'daily',
                    },
                },
            )
        }

        // payload 파싱
        const body = (await request.json()) as RequestBody
        const { imageBase64, mimeType } = body

        if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
            return NextResponse.json(
                { success: false, error: '이미지 데이터가 없습니다.' },
                { status: 400 },
            )
        }
        if (typeof mimeType !== 'string' || !SUPPORTED_MIME_TYPES.has(mimeType)) {
            return NextResponse.json(
                { success: false, error: 'PNG·JPG·WEBP만 지원합니다.' },
                { status: 400 },
            )
        }

        // base64 길이 → raw bytes 추정. 클라이언트가 압축을 회피했을 때를 위한 서버 2차 차단.
        const estimatedRawBytes = Math.floor((imageBase64.length * 3) / 4)
        if (estimatedRawBytes > MAX_BASE64_BYTES) {
            return NextResponse.json(
                { success: false, error: '이미지가 너무 큽니다. 4MB 이하로 압축해주세요.' },
                { status: 413 },
            )
        }

        // 클라이언트가 data URL prefix(`data:image/png;base64,`)를 보냈을 수도 있으니 정규화.
        const stripped = imageBase64.includes(',')
            ? imageBase64.slice(imageBase64.indexOf(',') + 1)
            : imageBase64

        // Gemini Vision 호출
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: OCR_SYSTEM_PROMPT,
            generationConfig: {
                responseMimeType: 'application/json',
                // OCR_RESPONSE_SCHEMA 는 as const 라 readonly. SDK 타입은 mutable 을 기대하므로 cast.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: OCR_RESPONSE_SCHEMA as any,
                temperature: 0,
            },
        })

        const result = await model.generateContent([
            { inlineData: { mimeType, data: stripped } },
        ])
        const responseText = result.response.text()

        let parsed: OcrResponse
        try {
            parsed = JSON.parse(responseText)
        } catch {
            console.error('[ai/ocr-import] Gemini returned non-JSON:', responseText.slice(0, 200))
            return NextResponse.json(
                { success: false, error: '이미지 분석에 실패했습니다. 다시 시도해주세요.' },
                { status: 502 },
            )
        }

        const holdings = Array.isArray(parsed.holdings) ? parsed.holdings : []

        // 빈 결과 — OCR 실패가 아닌 정상 응답이지만, UI 가 명확히 빈 상태를 그릴 수 있도록 200 반환.
        if (holdings.length === 0) {
            return NextResponse.json({
                success: true,
                resolved: [],
                unresolved: [],
                detected: 0,
            })
        }

        // OcrHoldingItem → ImportItem 변환.
        // analyzeBulkImport 는 identifier 한 필드만 받으므로 stockName 을 그대로 넘김.
        // purchaseRate 는 USD 종목일 때만 의미 — KRW 종목에 잘못 들어와도 analyzeBulkImport 가 무시.
        const items: ImportItem[] = holdings
            .filter(
                h =>
                    typeof h?.stockName === 'string' &&
                    h.stockName.trim().length > 0 &&
                    typeof h?.quantity === 'number' &&
                    h.quantity > 0 &&
                    typeof h?.averagePrice === 'number' &&
                    h.averagePrice > 0,
            )
            .map(h => ({
                identifier: h.stockName.trim(),
                quantity: Math.trunc(h.quantity),
                averagePrice: h.averagePrice,
                ...(typeof h.purchaseRate === 'number' && h.purchaseRate > 0
                    ? { purchaseRate: h.purchaseRate }
                    : {}),
            }))

        if (items.length === 0) {
            return NextResponse.json({
                success: true,
                resolved: [],
                unresolved: [],
                detected: holdings.length,
            })
        }

        // 기존 일괄등록 분석 함수 — KIS Master + Yahoo fallback + USD 환율 자동채움.
        // 100개 가드는 analyzeBulkImport 내부에서 처리됨.
        const analysis = await analyzeBulkImport(items)

        if (!analysis.success) {
            return NextResponse.json(
                { success: false, error: analysis.error ?? '분석에 실패했습니다.' },
                { status: 500 },
            )
        }

        return NextResponse.json({
            success: true,
            resolved: analysis.resolved,
            unresolved: analysis.unresolved,
            detected: holdings.length,
        })
    } catch (error) {
        console.error('[ai/ocr-import] error:', error)

        const errMsg = error instanceof Error ? error.message : String(error)
        const errStatus = (error as { status?: number })?.status

        if (errStatus === 429 || /RESOURCE_EXHAUSTED|quota/i.test(errMsg)) {
            return NextResponse.json(
                { success: false, error: '이미지 인식 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
                { status: 429 },
            )
        }
        if (errStatus === 401 || errStatus === 403 || /UNAUTHENTICATED|API key/i.test(errMsg)) {
            return NextResponse.json(
                { success: false, error: 'AI 어시스턴트 인증에 실패했습니다. 관리자에게 문의해주세요.' },
                { status: 503 },
            )
        }

        return NextResponse.json(
            { success: false, error: '이미지 분석 중 오류가 발생했습니다.' },
            { status: 500 },
        )
    }
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건. `ImportItem` / `analyzeBulkImport` 모두 `app/actions/admin-actions.ts` 에서 export 되어 있어 import 정상.

- [ ] **Step 3: 빠른 수동 ping (curl)**

dev 서버 띄운 상태에서 PRO 미사용 계정 세션 쿠키로 호출 시 403 응답이 와야 함:

```bash
# 비로그인 시: 401
curl -i -X POST http://localhost:3000/api/ai/ocr-import \
  -H 'Content-Type: application/json' \
  -d '{"imageBase64":"abc","mimeType":"image/png"}'
```

Expected: `HTTP/1.1 401 Unauthorized` + `{"success":false,"error":"인증이 필요합니다."}`

- [ ] **Step 4: 커밋**

```bash
git add app/api/ai/ocr-import/route.ts
git commit -m "feat(api): OCR 이미지 인식 endpoint 추가

- PRO 가드 + admin bypass + ocr/ocrDaily rate limit
- payload 4MB 한계 검증 (Vercel function body 안전 마진)
- gemini-2.5-flash + responseSchema 로 holdings JSON 강제
- analyzeBulkImport 그대로 호출 → resolved/unresolved 응답"
```

---

## Task 5: 이미지 모드 컴포넌트 — 파일 입력 + 압축 + 분석

`bulk-import-image-mode.tsx` 신규 컴포넌트의 첫 부분. `idle` / `analyzing` state 와 클라이언트 압축 함수까지.

**Files:**
- Create: `components/dashboard/bulk-import-image-mode.tsx`

- [ ] **Step 1: 컴포넌트 골격 + 압축 함수 + 분석 호출**

`components/dashboard/bulk-import-image-mode.tsx` 신규:

```tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { Loader2, Upload, AlertCircle, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { cn } from '@/lib/utils'
import type { AnalyzedItem } from '@/app/actions/admin-actions'

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_RAW_BYTES = 10 * 1024 * 1024 // 10MB
const TARGET_BASE64_BYTES = 4 * 1024 * 1024 // 4MB (서버 한계와 정합)

type OcrResponseBody = {
    success: boolean
    resolved?: AnalyzedItem[]
    unresolved?: AnalyzedItem[]
    detected?: number
    error?: string
    code?: string
}

type ImageModeState =
    | { kind: 'idle' }
    | { kind: 'analyzing'; previewUrl: string }
    | { kind: 'review'; previewUrl: string; resolved: AnalyzedItem[]; unresolved: AnalyzedItem[]; edited: boolean }
    | { kind: 'submitting'; previewUrl: string; resolved: AnalyzedItem[]; unresolved: AnalyzedItem[] }
    | { kind: 'error'; previewUrl?: string; message: string }

export interface BulkImportImageModeProps {
    accountId: string
    /** 사용자가 카드 리스트에서 확정 버튼을 눌렀을 때 부모(=BulkImportDialog)에 알림. */
    onSubmit: (items: AnalyzedItem[], strategy: 'overwrite' | 'add') => Promise<void>
    /** 부모가 다이얼로그 close 등의 이유로 컴포넌트 reset 을 강제할 때. */
    resetSignal: number
}

/**
 * 이미지를 canvas 로 압축해 base64 로 반환한다.
 * 1차: maxWidth 1920 / quality 0.92 → 2차(>4MB): maxWidth 1280 / quality 0.88.
 *
 * 결과: { dataUrl: "data:image/jpeg;base64,...", mimeType, bytes }.
 * 실패 시 throw — 호출부에서 toast.
 */
async function compressImage(file: File): Promise<{ dataUrl: string; mimeType: string; bytes: number }> {
    const objectUrl = URL.createObjectURL(file)
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image()
            el.onload = () => resolve(el)
            el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
            el.src = objectUrl
        })

        const tryEncode = (maxWidth: number, quality: number): { dataUrl: string; bytes: number } => {
            const scale = Math.min(1, maxWidth / img.naturalWidth)
            const w = Math.max(1, Math.round(img.naturalWidth * scale))
            const h = Math.max(1, Math.round(img.naturalHeight * scale))
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('canvas 2d context 생성 실패')
            ctx.drawImage(img, 0, 0, w, h)
            // JPEG 으로 통일 — OCR 입력으로 충분하고 base64 크기 가장 작음.
            const dataUrl = canvas.toDataURL('image/jpeg', quality)
            const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
            const bytes = Math.floor((base64.length * 3) / 4)
            return { dataUrl, bytes }
        }

        // 1차 압축
        let { dataUrl, bytes } = tryEncode(1920, 0.92)

        // 4MB 초과면 2차 압축
        if (bytes > TARGET_BASE64_BYTES) {
            ({ dataUrl, bytes } = tryEncode(1280, 0.88))
        }

        if (bytes > TARGET_BASE64_BYTES) {
            throw new Error('이미지 압축 후에도 크기가 너무 큽니다.')
        }

        return { dataUrl, mimeType: 'image/jpeg', bytes }
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

export function BulkImportImageMode({ accountId, onSubmit, resetSignal }: BulkImportImageModeProps) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [state, setState] = useState<ImageModeState>({ kind: 'idle' })

    // 부모가 reset 요청 시(다이얼로그 close 등) idle 로 복귀.
    // resetSignal 이 바뀔 때만 trigger.
    const prevResetRef = useRef(resetSignal)
    if (prevResetRef.current !== resetSignal) {
        prevResetRef.current = resetSignal
        if (state.kind !== 'idle') {
            // preview URL 정리는 다음 unmount 또는 새 파일 선택 시 처리되므로 단순 상태 리셋.
            setState({ kind: 'idle' })
        }
    }

    const handleFile = useCallback(async (file: File) => {
        // mimeType 1차 검증
        if (!ACCEPTED_MIME_TYPES.includes(file.type as typeof ACCEPTED_MIME_TYPES[number])) {
            toast.error(tx.ocrUnsupportedFormat)
            return
        }
        if (file.size > MAX_RAW_BYTES) {
            toast.error(tx.ocrTooLarge)
            return
        }

        let compressed: { dataUrl: string; mimeType: string }
        try {
            compressed = await compressImage(file)
        } catch (e) {
            console.error('[bulk-import-image-mode] compress failed:', e)
            toast.error(tx.ocrCompressFailed)
            return
        }

        const previewUrl = compressed.dataUrl
        setState({ kind: 'analyzing', previewUrl })

        try {
            const res = await fetch('/api/ai/ocr-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: compressed.dataUrl,
                    mimeType: compressed.mimeType,
                }),
            })
            const body = (await res.json()) as OcrResponseBody

            if (!res.ok || !body.success) {
                const message =
                    body.code === 'PRO_REQUIRED'
                        ? tx.ocrProOnly
                        : body.code === 'OCR_DAILY_LIMIT'
                            ? tx.ocrDailyLimit
                            : res.status === 429
                                ? tx.ocrBurstLimit
                                : body.error || tx.ocrAnalysisFailed
                setState({ kind: 'error', previewUrl, message })
                toast.error(message)
                return
            }

            const resolved = body.resolved ?? []
            const unresolved = body.unresolved ?? []

            if (resolved.length === 0 && unresolved.length === 0) {
                setState({ kind: 'error', previewUrl, message: tx.ocrEmptyResult })
                toast.warning(tx.ocrEmptyResult)
                return
            }

            setState({ kind: 'review', previewUrl, resolved, unresolved, edited: false })
        } catch (e) {
            console.error('[bulk-import-image-mode] fetch failed:', e)
            setState({ kind: 'error', previewUrl, message: tx.ocrAnalysisFailed })
            toast.error(tx.ocrAnalysisFailed)
        }
    }, [tx])

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleFile(file)
        // 같은 파일 재선택 가능하도록 input value 초기화.
        e.target.value = ''
    }

    const handleChangeImage = () => {
        if (state.kind === 'review' && state.edited) {
            if (!window.confirm(tx.ocrChangeImageConfirm)) return
        }
        fileInputRef.current?.click()
    }

    // -------- 렌더 --------
    return (
        <div className="space-y-3">
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_MIME_TYPES.join(',')}
                onChange={handleFileInputChange}
                className="hidden"
            />

            {state.kind === 'idle' && (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!accountId}
                    className={cn(
                        'w-full rounded-md border border-dashed border-primary/60 bg-accent-soft/30',
                        'px-4 py-8 text-sm text-center text-muted-foreground',
                        'hover:bg-accent-soft/50 transition-colors disabled:opacity-50',
                    )}
                >
                    <Upload className="w-5 h-5 mx-auto mb-2 opacity-70" />
                    {tx.ocrUploadHint}
                </button>
            )}

            {state.kind === 'analyzing' && (
                <div className="rounded-md border border-border bg-accent-soft/30 px-4 py-8 text-sm text-center text-muted-foreground inline-flex flex-col items-center gap-2 w-full">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {tx.ocrAnalyzing}
                </div>
            )}

            {state.kind === 'error' && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive inline-flex items-center gap-1.5 w-full">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="flex-1">{state.message}</span>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1 text-[11px] underline"
                    >
                        <RefreshCw className="w-3 h-3" /> {tx.ocrRetry}
                    </button>
                </div>
            )}

            {/* review / submitting 상태의 UI 는 Task 6, 7 에서 추가 */}

            {/* TODO(Task 7): submitting 처리, onSubmit 호출, 이미지 변경 confirm */}
            {(state.kind === 'review' || state.kind === 'submitting') && (
                <ReviewPlaceholder
                    state={state}
                    onChangeImage={handleChangeImage}
                />
            )}
        </div>
    )
}

// Task 6 에서 정식 구현으로 교체. 지금은 분석 결과를 단순 텍스트로 노출해 흐름이 정상인지 확인.
function ReviewPlaceholder({
    state,
    onChangeImage,
}: {
    state: Extract<ImageModeState, { kind: 'review' | 'submitting' }>
    onChangeImage: () => void
}) {
    return (
        <div className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex items-start gap-3">
                <img
                    src={state.previewUrl}
                    alt="upload preview"
                    className="w-20 h-20 object-cover rounded-md border border-border shrink-0"
                />
                <div className="flex-1 text-xs space-y-1">
                    <div className="font-bold">분석 결과 (Task 6 에서 카드로 교체)</div>
                    <div>resolved: {state.resolved.length}개</div>
                    <div>unresolved: {state.unresolved.length}개</div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={onChangeImage}>
                    <X className="w-3.5 h-3.5" />
                </Button>
            </div>
        </div>
    )
}
```

> **참고:** `ReviewPlaceholder` 는 Task 6 / 7 에서 정식 카드 리스트와 확정 흐름으로 교체될 임시 컴포넌트입니다. Task 5 단독으로 빌드·동작 가능하도록 둡니다.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건. `AnalyzedItem` 은 `admin-actions.ts` 에서 export 되어 있어 import 정상. i18n 키는 Task 2 에서 추가됨.

- [ ] **Step 3: 커밋**

```bash
git add components/dashboard/bulk-import-image-mode.tsx
git commit -m "feat(bulk-import): OCR 이미지 모드 컴포넌트 — 입력·압축·분석

- canvas 압축(1920px / q 0.92 → 1280px / q 0.88 재시도)
- /api/ai/ocr-import 호출 + 에러 코드(PRO_REQUIRED·OCR_DAILY_LIMIT) 분기
- idle/analyzing/error 상태와 임시 review placeholder
- 카드 리스트·확정 흐름은 다음 task 에서"
```

---

## Task 6: 이미지 모드 컴포넌트 — 카드 리스트 + inline edit + 종목 검색

`ReviewPlaceholder` 를 정식 카드 리스트로 교체. 종목별 inline edit, 모호/실패 카드의 종목 검색 콤보 통합.

**Files:**
- Modify: `components/dashboard/bulk-import-image-mode.tsx`

- [ ] **Step 1: 카드 컴포넌트 + 편집 가능한 상태 도입**

기존 `ReviewPlaceholder` 함수와 `state.kind === 'review'` 분기를 다음과 같이 교체.

먼저 파일 상단 import 에 `StockSearchCombobox` 추가:

```tsx
import { StockSearchCombobox } from '@/components/dashboard/stock-search-combobox'
import { Trash2 } from 'lucide-react'
```

`ImageModeState` 의 `review` 분기에 사용자 편집 결과를 담을 새 타입을 추가. `AnalyzedItem` 은 OCR 분석 결과(불변)이고, 사용자가 inline edit 한 값은 별도 보관.

기존:
```ts
| { kind: 'review'; previewUrl: string; resolved: AnalyzedItem[]; unresolved: AnalyzedItem[]; edited: boolean }
```

교체:
```ts
| { kind: 'review'; previewUrl: string; cards: ReviewCard[]; edited: boolean }
```

`ReviewCard` 타입을 컴포넌트 파일 상단(타입 정의 영역, `ImageModeState` 위)에 추가:

```ts
/**
 * 카드 한 장의 사용자 편집 가능 모델.
 * - analyzed: 서버가 반환한 원본 (불변, 표시 참고용)
 * - draft: 사용자가 inline edit 한 현재 값
 * - selected: 등록 대상 체크 여부. resolved 는 자동 true, ambiguous/unresolved 는 false 시작.
 */
type ReviewCard = {
    /** 안정적 key — uuid 같지만 외부 의존성 피하기 위해 인덱스+identifier 조합. */
    id: string
    analyzed: AnalyzedItem
    draft: {
        stockCode?: string
        stockName?: string
        market?: string
        currency?: string
        effectiveRate?: number
        quantity: number
        averagePrice: number
        purchaseRate?: number
    }
    selected: boolean
    /** 사용자가 종목 검색 콤보로 카드의 종목을 교체한 경우 true — 화면 표시용. */
    replaced: boolean
}

function buildInitialCards(resolved: AnalyzedItem[], unresolved: AnalyzedItem[]): ReviewCard[] {
    const cards: ReviewCard[] = []
    resolved.forEach((a, i) => {
        cards.push({
            id: `r-${i}-${a.stockCode ?? a.identifier}`,
            analyzed: a,
            draft: {
                stockCode: a.stockCode,
                stockName: a.stockName,
                market: a.market,
                currency: a.currency,
                effectiveRate: a.effectiveRate,
                quantity: a.inputQty,
                averagePrice: a.inputPrice,
                purchaseRate: a.inputRate ?? a.effectiveRate,
            },
            selected: true,
            replaced: false,
        })
    })
    unresolved.forEach((a, i) => {
        cards.push({
            id: `u-${i}-${a.identifier}`,
            analyzed: a,
            draft: {
                quantity: a.inputQty,
                averagePrice: a.inputPrice,
            },
            selected: false,
            replaced: false,
        })
    })
    return cards
}
```

이제 `handleFile` 내부 review 상태 설정 부분을 교체:

기존:
```ts
setState({ kind: 'review', previewUrl, resolved, unresolved, edited: false })
```

교체:
```ts
setState({
    kind: 'review',
    previewUrl,
    cards: buildInitialCards(resolved, unresolved),
    edited: false,
})
```

- [ ] **Step 2: 카드 리스트 렌더 컴포넌트 작성**

`ReviewPlaceholder` 를 다음 `ReviewCardList` 로 교체:

```tsx
function ReviewCardList({
    state,
    onChangeImage,
    onUpdate,
    onSubmit,
}: {
    state: Extract<ImageModeState, { kind: 'review' }>
    onChangeImage: () => void
    onUpdate: (next: ReviewCard[], edited: boolean) => void
    onSubmit: (strategy: 'overwrite' | 'add') => void
}) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage
    const [strategy, setStrategy] = useState<'overwrite' | 'add'>('overwrite')

    const updateCard = (id: string, patch: Partial<ReviewCard>) => {
        const next = state.cards.map(c => (c.id === id ? { ...c, ...patch } : c))
        onUpdate(next, true)
    }

    const removeCard = (id: string) => {
        const next = state.cards.filter(c => c.id !== id)
        onUpdate(next, true)
    }

    const total = state.cards.length
    const ready = state.cards.filter(c => c.selected && c.draft.stockCode).length

    return (
        <div className="space-y-3">
            {/* 이미지 썸네일 + 변경 버튼 */}
            <div className="flex items-center gap-3 rounded-md border border-border bg-background p-2">
                <img
                    src={state.previewUrl}
                    alt={tx.ocrThumbnailAlt}
                    className="w-14 h-14 object-cover rounded border border-border shrink-0"
                />
                <div className="flex-1 text-[11px] text-muted-foreground">
                    {tx.ocrCountSummary
                        .replace('{total}', String(total))
                        .replace('{ready}', String(ready))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onChangeImage}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    {tx.ocrChangeImage}
                </Button>
            </div>

            {/* 카드 리스트 */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {state.cards.map(card => (
                    <ReviewCardItem
                        key={card.id}
                        card={card}
                        onChange={patch => updateCard(card.id, patch)}
                        onRemove={() => removeCard(card.id)}
                    />
                ))}
            </div>

            {/* 전략 선택 */}
            <div>
                <label className="block text-[11px] font-bold tracking-wide text-muted-foreground mb-1.5 uppercase">
                    {tx.strategy}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                    <button
                        type="button"
                        onClick={() => setStrategy('overwrite')}
                        className={cn(
                            'py-2 text-[12px] font-bold rounded-sm border transition-colors',
                            strategy === 'overwrite'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:bg-accent-soft',
                        )}
                    >
                        {tx.strategyOverwrite}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStrategy('add')}
                        className={cn(
                            'py-2 text-[12px] font-bold rounded-sm border transition-colors',
                            strategy === 'add'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:bg-accent-soft',
                        )}
                    >
                        {tx.strategyAdd}
                    </button>
                </div>
            </div>

            <Button
                type="button"
                onClick={() => onSubmit(strategy)}
                disabled={ready === 0}
                className="w-full"
            >
                {tx.ocrSubmitButton.replace('{count}', String(ready))}
            </Button>
        </div>
    )
}

function ReviewCardItem({
    card,
    onChange,
    onRemove,
}: {
    card: ReviewCard
    onChange: (patch: Partial<ReviewCard>) => void
    onRemove: () => void
}) {
    const { language } = useLanguage()
    const tx = translations[language].portfolioManage

    const isResolved = !!card.draft.stockCode
    const isAmbiguousOrUnresolved = !isResolved // unresolved 만이 아니라, OCR 이 매칭 못 한 모든 경우.
    const isUSD = card.draft.currency === 'USD'

    return (
        <div
            className={cn(
                'rounded-md border p-3 space-y-2',
                isResolved
                    ? 'border-border bg-background'
                    : 'border-amber-500/50 bg-amber-500/5',
            )}
        >
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={card.selected}
                    onChange={e => onChange({ selected: e.target.checked })}
                    disabled={!isResolved}
                    className="w-4 h-4"
                    aria-label="등록 대상 선택"
                />
                <div className="flex-1 min-w-0">
                    {isResolved ? (
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm truncate">{card.draft.stockName}</span>
                            <span className="text-[10px] text-muted-foreground">{card.draft.stockCode}</span>
                            {isUSD && (
                                <span className="text-[10px] bg-accent-soft px-1.5 py-0.5 rounded">USD</span>
                            )}
                            {card.replaced && (
                                <span className="text-[10px] text-amber-600">교체됨</span>
                            )}
                        </div>
                    ) : (
                        <div className="text-[11px] text-amber-700">
                            {tx.ocrUnresolvedHint} (원문: "{card.analyzed.identifier}")
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="카드 제거"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* 종목 검색 콤보 — 모호/실패 시 보임 */}
            {isAmbiguousOrUnresolved && (
                <StockSearchCombobox
                    value={card.draft.stockName ?? ''}
                    inline
                    onSelect={stock => {
                        onChange({
                            draft: {
                                ...card.draft,
                                stockCode: stock.stockCode,
                                stockName: stock.nameKo || stock.stockName,
                                market: stock.market,
                                // 시장 → 통화 추정. KOSPI/KOSDAQ 면 KRW, 그 외 USD.
                                currency:
                                    stock.market === 'KOSPI' || stock.market === 'KOSDAQ' ? 'KRW' : 'USD',
                            },
                            selected: true,
                            replaced: true,
                        })
                    }}
                />
            )}

            {/* 수량 / 평단가 inline edit */}
            <div className={cn('grid gap-2', isUSD ? 'grid-cols-3' : 'grid-cols-2')}>
                <label className="text-[11px]">
                    <div className="text-muted-foreground mb-0.5">{tx.quantity}</div>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={card.draft.quantity}
                        onChange={e =>
                            onChange({
                                draft: { ...card.draft, quantity: Math.max(0, Math.trunc(Number(e.target.value))) },
                            })
                        }
                        className="w-full border border-input bg-background rounded-sm h-8 px-2 text-sm"
                    />
                </label>
                <label className="text-[11px]">
                    <div className="text-muted-foreground mb-0.5">{tx.averagePrice}</div>
                    <input
                        type="number"
                        min={0}
                        step={0.0001}
                        value={card.draft.averagePrice}
                        onChange={e =>
                            onChange({
                                draft: { ...card.draft, averagePrice: Math.max(0, Number(e.target.value)) },
                            })
                        }
                        className="w-full border border-input bg-background rounded-sm h-8 px-2 text-sm"
                    />
                </label>
                {isUSD && (
                    <label className="text-[11px]">
                        <div className="text-muted-foreground mb-0.5">환율</div>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={card.draft.purchaseRate ?? card.draft.effectiveRate ?? 0}
                            onChange={e =>
                                onChange({
                                    draft: { ...card.draft, purchaseRate: Math.max(0, Number(e.target.value)) },
                                })
                            }
                            className="w-full border border-input bg-background rounded-sm h-8 px-2 text-sm"
                        />
                    </label>
                )}
            </div>
        </div>
    )
}
```

> **참고:** `tx.quantity` / `tx.averagePrice` / `tx.strategy` / `tx.strategyOverwrite` / `tx.strategyAdd` 는 기존 `portfolioManage` 섹션에 이미 정의되어 있다는 가정. `bulk-import-dialog.tsx` 에서 사용 중인 동일 키이므로 추가 작업 불필요.

- [ ] **Step 2: 메인 컴포넌트 렌더에서 ReviewPlaceholder → ReviewCardList 교체**

`BulkImportImageMode` 의 review 분기를 교체:

기존:
```tsx
{(state.kind === 'review' || state.kind === 'submitting') && (
    <ReviewPlaceholder state={state} onChangeImage={handleChangeImage} />
)}
```

교체:
```tsx
{state.kind === 'review' && (
    <ReviewCardList
        state={state}
        onChangeImage={handleChangeImage}
        onUpdate={(next, edited) => setState({ ...state, cards: next, edited })}
        onSubmit={() => {
            /* Task 7 에서 구현 */
        }}
    />
)}

{state.kind === 'submitting' && (
    <div className="rounded-md border border-border bg-accent-soft/30 px-4 py-8 text-sm text-center text-muted-foreground inline-flex flex-col items-center gap-2 w-full">
        <Loader2 className="w-5 h-5 animate-spin" />
        등록 중...
    </div>
)}
```

`ReviewPlaceholder` 함수 정의는 삭제.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건. `StockSearchCombobox` 의 `onSelect` 인자 `Stock` 타입은 `stockCode` / `nameKo` / `nameEn` / `market` 을 가짐 (해당 컴포넌트 정의 참조).

- [ ] **Step 4: 커밋**

```bash
git add components/dashboard/bulk-import-image-mode.tsx
git commit -m "feat(bulk-import): OCR 검토 카드 리스트 + inline edit + 종목 검색

- ReviewCard 모델: analyzed(불변) + draft(편집) + selected/replaced
- resolved 카드는 자동 체크, ambiguous/unresolved 는 콤보박스 선택 강제
- 수량/평단가 inline edit, USD 카드는 환율 필드 추가
- 카드 X 버튼으로 제거, 전략(덮어쓰기/추가) 선택 + 확정 버튼 카운트"
```

---

## Task 7: 이미지 모드 — 확정 흐름 + 에러 처리 + 이미지 변경 confirm

`onSubmit` 호출, `submitting` → `done`/`error` 전이, 변경 확정 시 carry-on 처리.

**Files:**
- Modify: `components/dashboard/bulk-import-image-mode.tsx`

- [ ] **Step 1: handleSubmit 함수 추가**

`BulkImportImageMode` 함수 안, `handleChangeImage` 바로 아래에 `handleSubmit` 추가:

```tsx
const handleSubmit = useCallback(
    async (strategy: 'overwrite' | 'add') => {
        if (state.kind !== 'review') return

        // 카드 중 selected + stockCode 있는 것만 → AnalyzedItem 형태로 부모에게 전달.
        // executeBulkImport 는 stockCode/identifier 기반 lookup 이므로 draft 의 stockCode 를 identifier 로.
        const items: AnalyzedItem[] = state.cards
            .filter(c => c.selected && c.draft.stockCode)
            .map(c => ({
                ...c.analyzed,
                stockCode: c.draft.stockCode,
                stockName: c.draft.stockName ?? c.analyzed.stockName,
                market: c.draft.market ?? c.analyzed.market,
                currency: c.draft.currency ?? c.analyzed.currency,
                inputQty: c.draft.quantity,
                inputPrice: c.draft.averagePrice,
                inputRate: c.draft.purchaseRate,
                effectiveRate: c.draft.effectiveRate ?? c.analyzed.effectiveRate,
                status: 'resolved' as const,
            }))

        if (items.length === 0) {
            toast.error(tx.nothingToImportDesc)
            return
        }

        setState({
            kind: 'submitting',
            previewUrl: state.previewUrl,
            resolved: items, // 화면 표시용으로만 유지
            unresolved: [],
        })

        try {
            await onSubmit(items, strategy)
            // 부모(BulkImportDialog) 가 성공 후 close + reset 처리. 여기서는 idle 로 복귀하지 않음.
        } catch (e) {
            console.error('[bulk-import-image-mode] submit failed:', e)
            setState({
                kind: 'error',
                previewUrl: state.previewUrl,
                message: tx.ocrAnalysisFailed,
            })
            toast.error(tx.ocrAnalysisFailed)
        }
    },
    [state, onSubmit, tx],
)
```

`submitting` 상태 일부 필드를 위에서 화면 표시용으로 유지하기 위해 `ImageModeState` 의 `submitting` 분기를 다시 점검. 이미 `resolved: AnalyzedItem[]` 을 가지고 있어 OK.

- [ ] **Step 2: ReviewCardList 의 `onSubmit` 콜백 연결**

기존 (Task 6 에서 placeholder):
```tsx
onSubmit={() => {
    /* Task 7 에서 구현 */
}}
```

교체:
```tsx
onSubmit={strategy => handleSubmit(strategy)}
```

- [ ] **Step 3: 변경 확인 후 새 파일 선택 — handleChangeImage 검증**

Task 5 에서 작성한 `handleChangeImage` 는 review 상태에서 `edited === true` 일 때만 confirm 다이얼로그 표시. Task 6 에서 `cards` 모델로 변경되었으므로 `state.edited` 체크 그대로 유효. 변경 불필요. 확인만.

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건. `tx.nothingToImportDesc` 는 기존 키이므로 추가 작업 없음.

- [ ] **Step 5: 커밋**

```bash
git add components/dashboard/bulk-import-image-mode.tsx
git commit -m "feat(bulk-import): OCR 확정 흐름 + 에러 분기 완성

- selected + stockCode 있는 카드만 AnalyzedItem 으로 변환해 부모 onSubmit 호출
- submitting → done(부모 처리) / error 전이
- 부모가 다이얼로그 close 시 resetSignal 로 idle 복귀"
```

---

## Task 8: bulk-import-dialog 모드 탭 통합

기존 다이얼로그에 `📷 이미지` / `📋 텍스트` 탭을 추가. 텍스트 모드는 현재 흐름 그대로, 이미지 모드는 신규 컴포넌트 마운트. 디폴트 = 📋 텍스트.

**Files:**
- Modify: `components/dashboard/bulk-import-dialog.tsx`

- [ ] **Step 1: import 추가 + 상태 추가**

파일 상단 import 에 추가:

```tsx
import { BulkImportImageMode } from './bulk-import-image-mode'
import { isProUser as _isProUserClient } from '@/lib/billing/subscription' // 미사용 — 가드용 import 표식. 실제 가드는 prop 으로 전달.
```

> **참고:** `isProUser` 는 server-only 함수이므로 client 컴포넌트에서 직접 호출 불가. **부모 컴포넌트(`portfolio-client.tsx` 등 BulkImportDialog 호출 측)가 `isPro` boolean 을 prop 으로 전달**해야 한다. 다음 step 에서 prop 추가.

`BulkImportDialogProps` 에 `isPro?: boolean` 추가:

```tsx
interface BulkImportDialogProps {
    children?: React.ReactNode
    onSuccess?: () => void
    isPro?: boolean
}

export function BulkImportDialog({ children, onSuccess, isPro = false }: BulkImportDialogProps) {
```

기존 상태 변수 아래에 모드 상태 + reset signal 추가:

```tsx
    const [mode, setMode] = useState<'text' | 'image'>('text') // 디폴트: 텍스트 (자물쇠 첫 화면 노출 방지)
    const [imageResetSignal, setImageResetSignal] = useState(0)
```

기존 `reset` 함수도 imageResetSignal 증가하도록:

```tsx
    const reset = () => {
        setRawText('')
        setResolved([])
        setUnresolved([])
        setHasAnalyzed(false)
        setMode('text')
        setImageResetSignal(s => s + 1)
    }
```

- [ ] **Step 2: 탭 UI 추가 + 모드별 본문 분기**

기존 다이얼로그 본문 `<div className="space-y-4">` 시작부 바로 다음, 계좌 셀렉터 위에 탭 추가:

```tsx
                <div className="space-y-4">
                    {/* 모드 탭 */}
                    <div className="flex gap-1 border-b border-border">
                        <button
                            type="button"
                            onClick={() => {
                                if (!isPro) {
                                    toast(tx.ocrProOnly, { description: '곧 출시 예정이에요. 조금만 기다려주세요!' })
                                    return
                                }
                                setMode('image')
                            }}
                            className={cn(
                                'px-3 py-2 text-xs font-bold border-b-2 transition-colors inline-flex items-center gap-1',
                                mode === 'image' && isPro
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                            aria-label={isPro ? tx.ocrModeTab : `${tx.ocrModeTab} (PRO)`}
                        >
                            {tx.ocrModeTab}
                            {!isPro && (
                                <span className="text-[9px] bg-foreground text-background px-1 rounded">🔒</span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('text')}
                            className={cn(
                                'px-3 py-2 text-xs font-bold border-b-2 transition-colors',
                                mode === 'text'
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tx.textModeTab}
                        </button>
                    </div>

                    {/* 계좌 셀렉터 — 두 모드 공통 */}
                    {/* ... 기존 계좌 셀렉터 코드 그대로 ... */}
```

이미지 모드일 때는 기존 textarea + 형식 안내 + 분석 결과 영역을 숨기고 `BulkImportImageMode` 렌더. 텍스트 모드 시 기존 흐름 유지.

기존 다이얼로그의 `{/* 형식 안내 */}` 부터 `{/* 분석 버튼 */}`, `{/* 분석 결과 */}` 까지의 블록을 `mode === 'text'` 조건으로 감싼다:

```tsx
                    {mode === 'text' ? (
                        <>
                            {/* 형식 안내 */}
                            {/* ... 기존 형식 안내 ... */}

                            {/* Raw 입력 */}
                            {/* ... 기존 textarea ... */}

                            {/* 전략 */}
                            {/* ... 기존 전략 ... */}

                            {/* 분석 버튼 */}
                            {/* ... 기존 분석 버튼 ... */}

                            {/* 분석 결과 (resolved/unresolved 카드 + 실행 버튼) */}
                            {/* ... 기존 결과 ... */}
                        </>
                    ) : (
                        <BulkImportImageMode
                            accountId={accountId}
                            resetSignal={imageResetSignal}
                            onSubmit={async (items, strategy) => {
                                // 이미지 모드 확정 — 기존 executeBulkImport 직접 호출 (텍스트 모드의 handleExecute 와 동일 로직)
                                if (!accountId) {
                                    toast.error(tx.accountRequired)
                                    return
                                }
                                const payload = items.map(r => ({
                                    identifier: r.stockCode ?? r.identifier,
                                    quantity: r.inputQty,
                                    averagePrice: r.inputPrice,
                                    ...(typeof r.inputRate === 'number' && r.inputRate > 0
                                        ? { purchaseRate: r.inputRate }
                                        : typeof r.effectiveRate === 'number' && r.effectiveRate > 0
                                            ? { purchaseRate: r.effectiveRate }
                                            : {}),
                                }))
                                const res = await executeBulkImport(payload, strategy, accountId)
                                if (res.success) {
                                    try {
                                        localStorage.setItem(RECENT_ACCOUNT_KEY, accountId)
                                    } catch { /* ignore */ }
                                    toast.success(tx.importSuccessDesc.replace('{count}', String(res.count ?? payload.length)))
                                    if (res.errors && res.errors.length > 0) {
                                        toast.warning(`${tx.importPartial}: ${res.errors.length}`)
                                    }
                                    setOpen(false)
                                    reset()
                                    onSuccess?.()
                                    startTransition(() => router.refresh())
                                    try { window.dispatchEvent(new Event('portfolio:refresh')) } catch { /* ignore */ }
                                } else {
                                    toast.error(res.error ?? tx.importFailed)
                                    throw new Error(res.error ?? 'import failed')
                                }
                            }}
                        />
                    )}
```

> 위 `executeBulkImport` 는 기존 import 그대로 사용 (`@/app/actions/admin-actions` 에서). 텍스트 모드의 `handleExecute` 와 동일 payload 변환을 그대로 따른다.

- [ ] **Step 3: BulkImportDialog 호출처에 `isPro` 전달**

`bulk-import-dialog.tsx` 의 호출처를 찾는다:

Run: `grep -rn "BulkImportDialog" app components --include="*.tsx" | grep -v "bulk-import-dialog.tsx"`

Expected: 호출하는 client 컴포넌트 1~2곳 (`portfolio-client.tsx` 추정).

각 호출처에서 `<BulkImportDialog ...>` 에 `isPro={isPro}` prop 을 추가한다. 부모가 이미 `isPro` 를 prop 으로 받고 있으면 그대로, 아니면 부모 → 호출처까지 prop drill 또는 page-level fetch 추가.

가장 안전한 방식: `portfolio-client.tsx` 등 호출처가 이미 `isPro` 를 가지고 있는지 확인 후 그대로 전달. 없으면 page server component 에서 `isProUser(session.user.id)` 호출 → prop 으로 내림.

```tsx
// 예시 (portfolio-client 가 isPro 를 prop 으로 받고 있는 경우)
<BulkImportDialog isPro={isPro} onSuccess={...}>
    <Button ...>일괄 등록</Button>
</BulkImportDialog>
```

- [ ] **Step 4: 타입 체크 + 빌드 검증**

Run: `npx tsc --noEmit`
Expected: 오류 0건.

Run: `npm run build`
Expected: 성공. 빌드 시간이 김 — 백그라운드 실행해도 OK.

- [ ] **Step 5: 커밋**

```bash
git add components/dashboard/bulk-import-dialog.tsx
# 호출처도 같이 변경됐다면 함께
git add app/dashboard/portfolio/portfolio-client.tsx
git commit -m "feat(bulk-import): 이미지/텍스트 모드 탭 통합

- 일괄등록 다이얼로그에 📷 이미지 / 📋 텍스트 탭 추가
- 디폴트 = 텍스트 (무료에 자물쇠 첫 화면 노출 방지)
- 무료 사용자가 이미지 탭 클릭 시 PRO 안내 토스트
- 이미지 모드 확정도 기존 executeBulkImport 흐름 100% 재사용"
```

---

## Task 9: 수동 E2E 검증 + 운영 admin SQL 안내

코드 변경 없는 검증 task. spec § 11 시나리오를 직접 돌려본다.

**Files:** 없음 (검증 only)

- [ ] **Step 1: 운영 admin SQL 적용 — 본인 계정**

이미 적용했다면 skip. 처음이면 두 환경 모두 실행:

```bash
# 운영(Supabase)
echo "UPDATE users SET role = 'admin' WHERE email = 's83286263@gmail.com';" | npx prisma db execute --stdin

# 로컬 PG
DIRECT_URL="$(grep '^DIRECT_URL=' .env.development.local | cut -d= -f2- | tr -d '"' | tr -d "'")" \
  npx prisma db execute --stdin <<< "UPDATE users SET role = 'admin' WHERE email = 's83286263@gmail.com';"
```

실행 후 로그아웃 → 재로그인하여 세션 갱신.

- [ ] **Step 2: dev 서버 실행**

```bash
npm run dev
```

- [ ] **Step 3: 정상 흐름 검증 (시나리오 1~4)**

브라우저에서 `/dashboard/portfolio` 진입 → 일괄 등록 버튼 클릭 → 다이얼로그 오픈. 다음 케이스 확인:

| 확인 | 기대 결과 |
|---|---|
| 다이얼로그 첫 화면 | 📋 텍스트 탭이 활성 (디폴트) |
| 📷 이미지 탭 클릭 (admin) | 이미지 업로드 영역 표시, 자물쇠 없음 |
| 키움/미래에셋 잔고 캡쳐 업로드 | 자동 압축 → 분석 중 → 카드 리스트 |
| 매칭된 카드 | 자동 체크, 종목명/수량/평단가 표시 |
| USD 카드 | 환율 필드 자동 채움, "USD" 배지 표시 |
| 모호 카드 ("삼성" 등) | 콤보박스로 종목 검색 가능 |
| 카드 X 버튼 | 해당 카드 제거 |
| 수량/평단가 inline edit | 값 변경 가능 |
| "N개 등록" 버튼 | 등록 후 토스트 + 다이얼로그 close + portfolio refresh |

- [ ] **Step 4: 엣지 케이스 검증 (시나리오 5~12)**

| 확인 | 기대 결과 |
|---|---|
| 12MB 이미지 업로드 | 클라이언트 토스트 "이미지가 너무 큽니다" |
| HEIC 파일 업로드 시도 | 토스트 "PNG·JPG·WEBP만 지원" |
| 흐릿한 캡쳐 업로드 | `holdings: []` → "이미지에서 종목을 찾지 못했어요" |
| 100개 초과 종목 캡쳐 | analyzeBulkImport 가드 발동 → 에러 메시지 |
| 카드 수정 후 이미지 변경 | confirm 다이얼로그 "수정 사항이 사라집니다" |
| 다이얼로그 close | 모든 state 리셋, 재오픈 시 텍스트 탭 디폴트 |

- [ ] **Step 5: 권한·한도 검증 (시나리오 13~15)**

| 확인 | 기대 결과 |
|---|---|
| 무료 계정으로 다이얼로그 열기 | 다이얼로그 열림, 📷 탭에 🔒 표시 |
| 무료 계정 📷 탭 클릭 | "OCR은 PRO 전용입니다" 토스트, 탭 전환 안 됨 |
| PRO 계정 11번째 호출 | 429 + "오늘 한도 소진" 토스트 |
| admin 계정 100번 호출 | 한도 통과 (모두 200) |
| 1분 내 6회 연속 호출 (non-admin) | 6번째 burst 429 |

> 운영 환경에서 한도 검증은 비용 발생 — 로컬 dev 환경 + `NODE_ENV !== 'production'` 일 때 `checkRateLimit` 이 null 반환(통과)함을 주의. 한도 검증은 staging 배포 후에만 의미 있음.

- [ ] **Step 6: 통합 검증 (시나리오 16~18)**

| 확인 | 기대 결과 |
|---|---|
| OCR 등록 직후 📋 텍스트 모드로 전환 | 다이얼로그 close 후 재오픈 — 텍스트 탭 정상 동작 |
| OCR 등록 후 portfolio holdings | 즉시 반영 (`portfolio:refresh` 이벤트) |
| 스냅샷 저장 | OCR 등록 종목 포함 |

- [ ] **Step 7: 빌드 통과 확인**

Run: `npm run build`
Expected: 성공 (배포 가능 상태).

- [ ] **Step 8: 플랜 완료 보고**

검증 결과를 사용자에게 짧게 보고. 통과 항목·실패 항목 분리. 실패 항목은 별도 issue 또는 fix task 로.

---

## Self-Review Notes

이 plan 작성 후 다음을 자체 점검했다:

1. **Spec coverage:** § 3 결정사항 14개, § 4 흐름 ⑤~⑲, § 5 신규/수정 파일 6개, § 9 오류 11개 — 모두 task 에 매핑됨.
2. **Placeholder scan:** "TBD", "appropriate error handling" 같은 표현 없음. Task 5 / 6 / 7 의 `ReviewPlaceholder` → `ReviewCardList` 교체는 명시적 진행이라 placeholder 가 아님.
3. **Type consistency:**
   - `ImportItem`, `AnalyzedItem` — `app/actions/admin-actions.ts` export 사용 (Task 4, 5, 6, 7).
   - `Stock` (`stock-search-combobox.tsx`) — `stockCode` / `nameKo` / `stockName` / `market` 필드 사용 (Task 6).
   - `ReviewCard.draft.currency` — `'KRW' | 'USD' | undefined`, 시장 → 통화 추정은 KOSPI/KOSDAQ 만 KRW (Task 6 콤보 onSelect).
   - rate limit key name: `ratelimit.ocr` / `ratelimit.ocrDaily` 일관 (Task 1, 4).

## 운영 전제 — 한 번만 실행

- **admin role 부여 SQL** (Task 9 Step 1).
- **`GOOGLE_AI_API_KEY`** 환경변수는 이미 AI 어시스턴트가 사용 중이라 추가 작업 없음.
- **Vercel function payload** 한계 4.5MB — 무료/Pro 플랜 차이 없이 동일. 압축 정책으로 자동 안전 마진 확보.

## 다음 단계

이 plan 으로 구현 시작 가능. 두 가지 실행 방식:

- **Subagent-Driven** (권장): task 단위로 fresh subagent dispatch → 각 task 종료 후 메인 세션이 검토. 빠른 iteration, 컨텍스트 보호.
- **Inline Execution**: 현재 세션에서 task 순차 실행 + 체크포인트 검토.
