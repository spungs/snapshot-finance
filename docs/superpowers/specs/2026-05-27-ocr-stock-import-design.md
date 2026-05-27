# OCR 종목 일괄 등록 — 설계 문서

- **상태**: Draft (사용자 검토 대기)
- **작성일**: 2026-05-27
- **작성**: 브레인스토밍 세션 결과
- **연계 작업**: 구현 계획 작성(`writing-plans`)에서 이어감

## 0. 한 줄 요약

증권사 앱 잔고 캡쳐 이미지 한 장을 업로드하면 Gemini Vision이 종목/수량/평단가/환율을 추출하여 카드 리스트로 펼치고, 사용자가 검토·수정 후 한 번에 등록한다. **OCR은 입력 수단이고, 매칭·검증·실행은 기존 일괄등록 백엔드를 그대로 재사용한다.**

## 1. 배경과 의도

- 사용자 요청: "이미지 업로드하면 OCR로 읽어서 종목 추가 카드들이 생기고, OCR이 확인한 데이터를 자동 바인딩해서 종목 추가/수정을 간편하게 하고 싶다."
- 기존 일괄등록(`bulk-import-dialog.tsx` → `analyzeBulkImport` → `executeBulkImport`)은 텍스트 라인 입력만 지원.
- OCR을 별도 기능으로 만들면 종목 매칭·계좌 매핑·USD 환율 자동채움·트랜잭션 롤백 같은 안전판을 다시 만들어야 함. **재사용이 압도적으로 합리적.**
- AI 어시스턴트(`/api/ai/portfolio`)와는 별개 — AI 어시는 자연어 단건 명령, OCR은 이미지 → 다건 일괄.

## 2. 성공 기준

1. PRO 사용자가 일괄등록 다이얼로그에서 **📷 이미지로** 탭을 누르고 캡쳐를 업로드하면 카드 리스트로 종목들이 자동 채워진다.
2. 매칭 성공 카드는 자동 체크되고, 모호/실패 카드는 사용자가 보정한 뒤에만 등록된다.
3. 트랜잭션 단일 커밋이라 일부 실패해도 부분 등록은 없다 (기존 `executeBulkImport` 보장).
4. 무료 사용자는 탭에 자물쇠가 보이고 호출 자체가 막힌다. PRO는 일일 10회, admin은 무제한.
5. iOS/Android 스크린샷(PNG 99%)이 자동 압축 후 OCR 정확도 손실 없이 처리된다.

## 3. 사용자 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 진입점 | 일괄등록 다이얼로그 안 **모드 탭 분리** (📷 이미지 / 📋 텍스트) |
| 디폴트 탭 | **📋 텍스트** — 무료 사용자에게 자물쇠가 첫 화면에 노출되지 않고, 기존 사용자 경험과 연속성 유지. 사용자가 명시적으로 📷 이미지 탭을 눌러 OCR 모드 진입 |
| 입력 범위 | **증권사 앱 잔고 캡쳐만** (손글씨/메모지는 비스코프) |
| OCR 엔진 | **Gemini 2.5 Flash** (멀티모달, flash-lite/pro 아님) |
| 출력 형식 | `responseSchema`로 JSON 강제 (`holdings: [{stockName, quantity, averagePrice, currency?, purchaseRate?}]`) |
| 백엔드 재사용 | `analyzeBulkImport` / `executeBulkImport` 그대로 호출 |
| 등록 전략 디폴트 | **덮어쓰기**(`overwrite`) — 캡쳐 = 현재 잔고 동기화이므로. 사용자가 "추가"로 변경 가능 |
| 게이팅 | **PRO 전용 + admin 무제한** (AI 어시 패턴 동일) |
| 일일 한도 | **별도 카운터 `ocrDaily` 10회/24h** — `aiDaily`와 분리 |
| 분당 burst | **별도 카운터 `ocr` 5회/60s** — 동시·연속 호출 방지 (이미지 호출이 비용 큼) |
| 이미지 포맷 | `image/png`, `image/jpeg`, `image/webp` 허용. `image/heic`·`image/heif`는 안내 토스트만(자동 변환 미도입) |
| 이미지 용량 | **raw 입력 ≤ 10MB**, 자동 압축 후 **base64 ≤ 4MB**(Vercel function payload 4.5MB 안전 마진) |
| 압축 정책 | max width **1920px** / quality **0.92** → 결과 ≥ 4MB면 max width **1280px**로 재시도 |
| 카드 분류 | `resolved`(자동 체크) / `ambiguous`(콤보박스 강제) / `unresolved`(수동 검색) / 삭제(X) |
| Admin 부여 | `users` 테이블에 본인 계정 SQL `UPDATE`로 `role='admin'` |

## 4. 아키텍처 & 데이터 흐름

```
[CLIENT] bulk-import-dialog (수정)
  ① 📷 이미지 탭 클릭
  ② 파일 선택 (PNG/JPEG/WEBP, ≤ 10MB)
  ③ 클라이언트 압축 (canvas, 1920px / q 0.92)
  ④ base64 인코딩 → fetch POST /api/ai/ocr-import
        ↓
[SERVER] /api/ai/ocr-import (신규)
  ⑤ auth() → 401
  ⑥ isProUser() → 403 (code: PRO_REQUIRED)
  ⑦ isAdmin ? skip : ocr burst (5/60s) → 429
       isAdmin ? skip : ocrDaily (10/1d) → 429 (code: OCR_DAILY_LIMIT)
  ⑧ payload 사이즈/mimeType 검증 → 413/400
  ⑨ gemini-2.5-flash.generateContent([prompt, {inlineData}])
       responseSchema로 holdings JSON 강제
  ⑩ holdings → ImportItem[] 변환
  ⑪ analyzeBulkImport(items)  ← 기존 함수 그대로
       KIS Master + Yahoo fallback + USD 환율 자동채움
  ⑫ { resolved: AnalyzedItem[], unresolved: AnalyzedItem[] } 응답
        ↓
[CLIENT] 카드 리스트 렌더 (검토 단계)
  ⑬ resolved 자동 체크, ambiguous/unresolved는 보정 필요
  ⑭ inline edit (수량·평단가·환율·종목 교체)
  ⑮ stock-search-combobox 재사용 (모호/실패 분기)
  ⑯ 전략 선택 (덮어쓰기 디폴트 / 추가)
  ⑰ "N개 등록" 버튼
        ↓
[SERVER] admin-actions.executeBulkImport (기존, 변경 없음)
  ⑱ 단일 트랜잭션 30s timeout
       overwrite: upsert / add: 가중평균 (decimal.js)
       환율 동결, IDOR 방어, MAX 100개 가드
  ⑲ holdingService.invalidate · revalidatePath
        ↓
[CLIENT] 토스트 + close + portfolio:refresh 이벤트
```

## 5. 컴포넌트 구조

### 5.1 신규 파일

- **`app/api/ai/ocr-import/route.ts`** — OCR API endpoint.
  - PRO 가드, ocrDaily rate limit, 이미지 검증, Gemini Vision 호출, ImportItem 변환, `analyzeBulkImport` 호출, 응답 매핑.
  - `maxDuration = 60`.
- **`components/dashboard/bulk-import-image-mode.tsx`** — 이미지 업로드 + OCR 결과 카드 리스트.
  - 내부 상태머신: `idle` → `analyzing` → `review` → `submitting` → `done` / `error`.
  - 클라이언트 압축(canvas), base64 인코딩, fetch 호출, 카드 렌더, inline edit, 종목 검색 콤보 통합.
- **`lib/ai/ocr-prompt.ts`** — Gemini Vision 시스템 프롬프트 + `responseSchema` 객체.
  - 추출 대상: stockName / quantity / averagePrice / currency / purchaseRate.
  - 함정 가이드: 평가금액·수익률·손익 제외, 콤마/단위 제거, 흐릿/잘림은 `holdings: []`.

### 5.2 수정 파일

- **`components/dashboard/bulk-import-dialog.tsx`** — 모드 탭 추가(📷 / 📋), 기존 textarea 흐름은 📋 탭으로 캡슐화. 계좌 셀렉터·전략·확정 버튼은 공유. PRO 가드 자물쇠 표시.
- **`lib/ratelimit.ts`** — limiter 2개 추가:
  - `ocr`: `slidingWindow(5, '60 s')`, prefix `@upstash/ratelimit/ocr` — 분당 burst
  - `ocrDaily`: `slidingWindow(10, '1 d')`, prefix `@upstash/ratelimit/ocr-daily` — 일일 한도
- **`app/actions/admin-actions.ts`** — 변경 없음. `analyzeBulkImport`는 이미 `'use server'` + `export` 상태이고, 동일 server-side 코드(이번 신규 API route)에서 직접 import 호출이 정상 동작.

### 5.3 건드리지 않는 것

- DB 스키마 (마이그레이션 없음).
- `executeBulkImport`, `holdingService`, KIS/Yahoo 검색, `stock-search-combobox`.
- 기존 일괄등록 텍스트 모드 흐름·키보드 핸들링·계좌 매핑.
- AI 어시스턴트(`/api/ai/portfolio`, `ai-chat.tsx`, `ai-action-card.tsx`).

## 6. UI 상태머신 — 이미지 모드

| 상태 | 진입 | 화면 | 다음 전이 |
|---|---|---|---|
| `idle` | 다이얼로그 open · 이미지 변경 | 업로드 드롭존 | 파일 선택 → `analyzing` |
| `analyzing` | 파일 선택 후 fetch 호출 | 스피너 + "이미지 분석 중..." | 응답 200 → `review` / 오류 → `error` |
| `review` | OCR 응답 도착 | **업로드한 이미지 썸네일** + 카드 리스트 + inline edit + 전략·확정 버튼 | 확정 → `submitting` / 이미지 변경 → confirm 후 `idle` (사용자가 카드를 수정했다면 "수정사항이 사라집니다, 계속할까요?" 다이얼로그) |
| `submitting` | 확정 클릭 | 버튼 disabled + 로딩 | 응답 → `done` / 오류 → `error` |
| `done` | executeBulkImport 성공 | 다이얼로그 close · refresh · 토스트 | (종료) |
| `error` | 어느 단계든 실패 | 토스트 + 재시도 버튼 | 재시도 → 이전 상태로 |

## 7. 카드 4가지 상태

| 카드 상태 | 트리거 | 사용자 액션 | 등록 가능 |
|---|---|---|---|
| `resolved` (clean) | KIS/Yahoo 매칭 1건 | inline edit | ✓ 자동 체크 |
| `resolved` (USD) | KRW 외 시장 | 환율 자동채움 배지 + 수정 | ✓ 자동 체크 |
| `ambiguous` | 부분 일치 2건 이상 | `stock-search-combobox`로 후보 선택 | 선택 후 ✓ |
| `unresolved` | 매칭 0건 | `stock-search-combobox`로 수동 검색 | 검색 후 ✓ |
| 삭제 | 사용자가 X 클릭 | — | 제외됨 |

## 8. OCR 호출 상세

### 8.1 모델·페이로드

- 모델: `gemini-2.5-flash` (멀티모달 기본 권장, 한글 OCR 견고).
- 호출:
  ```ts
  model.generateContent([
    promptText,
    { inlineData: { mimeType, data: base64WithoutPrefix } },
  ])
  ```
- 설정: `responseMimeType: 'application/json'`, `responseSchema` 강제, `temperature: 0` (정확도 우선).

### 8.2 responseSchema

```ts
{
  type: SchemaType.OBJECT,
  properties: {
    holdings: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          stockName:    { type: STRING },                  // 한글/영문 그대로
          quantity:     { type: NUMBER },                  // 주 단위, 정수
          averagePrice: { type: NUMBER },                  // 단위 없는 숫자
          currency:     { type: STRING, enum: ['KRW','USD'] },
          purchaseRate: { type: NUMBER },                  // USD 종목에만
        },
        required: ['stockName', 'quantity', 'averagePrice'],
      },
    },
  },
  required: ['holdings'],
}
```

### 8.3 시스템 프롬프트 요지

- ✓ 추출: 종목명·수량·평단가·(USD 매입환율).
- ⚠️ 함정: 평가금액·수익률·손익 제외 / 콤마·단위 제거 / `[ETF]` 같은 태그 포함 / 흐릿/잘림은 빈 배열.
- 🚫 금지: 자유 텍스트, 종목명 번역·표기 변경, 0주/음수.

### 8.4 이미지 처리

| 단계 | 정책 |
|---|---|
| 입력 허용 | `image/png`, `image/jpeg`, `image/webp` |
| HEIC/HEIF | 토스트로 "PNG/JPG로 저장해주세요" 안내 (자동 변환 미도입) |
| raw 한계 | 10MB |
| 압축 1차 | canvas, max width **1920px**, quality **0.92** |
| 압축 2차 | 1차 결과 base64가 4MB 초과면 max width **1280px**, quality **0.88** |
| 전송 | fetch POST JSON body `{ imageBase64, mimeType }` |
| 서버 재검증 | base64 길이 → 추정 사이즈 4MB 초과 시 413 |

### 8.5 비용 추정 (Google AI Studio 유료키)

- 입력 ≈ 3,000 tokens / 응답 ≈ 500 tokens / 호출당 ≈ $0.0009 ≈ 1.2원
- PRO 1명 최대 사용량: 10회/일 × 30일 = 300호출 ≈ $0.27/월 ≈ 360원
- 병목: 토큰 비용보다는 Gemini RPD가 먼저 차오를 수 있음 → 429 시 토스트 안내.

## 9. 오류 처리 매트릭스

| 케이스 | HTTP | 코드 | 클라이언트 UX |
|---|---|---|---|
| 비로그인 | 401 | — | 기존 미들웨어 차단 |
| 무료 사용자 호출 | 403 | `PRO_REQUIRED` | 자물쇠 토스트 + 텍스트 탭 자동 전환 |
| PRO 분당 5회 초과 (burst) | 429 | — | "요청이 너무 많습니다. 잠시 후 다시" |
| PRO 일일 10회 초과 | 429 | `OCR_DAILY_LIMIT` + `resetAt` | "오늘 한도 소진, 자정 초기화" |
| 이미지 4MB 초과 (압축 후) | 413 | — | 토스트 + state → idle |
| 잘못된 mimeType (PDF/HEIC) | 400 | — | 클라 1차 차단 + 서버 2차 |
| Gemini quota | 429 | — | "이미지 인식 한도 초과" + 재시도 |
| Gemini 인증 실패 | 503 | — | "AI 어시스턴트 미설정" |
| OCR 빈 배열 | 200 | — | "이미지에서 종목을 찾지 못했어요" |
| 일부 unresolved | 200 | — | resolved 자동 체크, unresolved 수동 검색 |
| executeBulkImport 트랜잭션 실패 | 500 | — | "롤백됨, 변경 0건" |
| Gemini가 깨진 JSON | 502 | — | "이미지 분석 실패, 재시도" |

## 10. 안전 보장

### 10.1 기존 코드가 이미 막아주는 것 (재사용)

- **트랜잭션 롤백** — 일부 실패해도 DB 변경 0건.
- **IDOR 방어** — `assertAccountOwnership`.
- **금융 계산 정밀도** — `decimal.js` 강제.
- **USD 환율 동결** — 매입 시점 보존.
- **MAX 100개 가드** — `MAX_BULK_IMPORT_ITEMS`.

### 10.2 OCR로 새로 생기는 위험과 완화

| 위험 | 완화책 |
|---|---|
| 잘못된 OCR 결과로 자산 오등록 | **검토 단계 강제** — 자동 등록 없음 |
| 모호 종목 자동 매칭으로 엉뚱한 종목 | `ambiguous`는 콤보박스 선택 강제 |
| 대용량 이미지로 함수 timeout | 압축 정책 + `maxDuration = 60` |
| 토큰 비용 폭주 | PRO 10회/일 + admin만 무제한 |
| Gemini가 자유 텍스트로 응답 | `responseSchema` 강제 → 깨지면 502 재시도 |

## 11. 수동 검증 시나리오 (테스트 프레임워크 없음)

### 정상 흐름
1. 키움 잔고 캡쳐 (KR 5개) → 5개 매칭 → 덮어쓰기 등록 → portfolio refresh.
2. 미래에셋 캡쳐 (US 포함) → USD 환율 자동채움 배지.
3. NH 캡쳐 (모호 "삼성") → 콤보박스 선택 → 등록.
4. 무료 사용자 → 다이얼로그는 열림, 📷 탭은 자물쇠 토스트.

### 엣지 케이스
5. 이미지 8MB → 자동 압축 후 통과.
6. 이미지 12MB → 클라 단 차단.
7. HEIC 파일 → 안내 토스트.
8. 흐릿한 캡쳐 → `holdings: []` → "찾지 못했어요".
9. 종목 100개 초과 → `MAX_BULK_IMPORT_ITEMS` 가드.
10. inline edit 수정값이 등록에 반영.
11. 이미지 변경 → 카드 수정 이력 있으면 confirm 다이얼로그 → 확인 후 카드 리스트 초기화.
12. 다이얼로그 close → state 리셋.

### 권한·한도
13. PRO 11번째 호출 → 429 + `resetAt` 표시.
14. admin 호출 → 한도 통과.
15. 동시 OCR 2회 → 첫 번째 끝나야 두 번째 진행.

### 통합
16. OCR 등록 직후 텍스트 모드 전환 OK.
17. 등록 후 `portfolio:refresh` 이벤트로 holdings 즉시 반영.
18. 스냅샷 저장 시 OCR 등록 종목도 포함.

## 12. 비스코프 (이번 작업에서 안 함)

- 손글씨/메모지 OCR.
- 다중 이미지 동시 업로드.
- HEIC 자동 변환 (피드백 따라 차후 검토).
- OCR 결과를 자동 등록(검토 생략) 모드.
- 증권사별 캡쳐 템플릿 사전 등록.
- OCR 분석 이력/감사 로그.

## 13. 운영 전제 — admin 권한 부여

배포 전 본인 계정에 `role = 'admin'` SQL을 두 환경 모두 적용:

```bash
# 운영(Supabase)
echo "UPDATE users SET role = 'admin' WHERE email = 's83286263@gmail.com';" | npx prisma db execute --stdin

# 로컬 PG
DIRECT_URL="$(grep '^DIRECT_URL=' .env.development.local | cut -d= -f2- | tr -d '\"' | tr -d \"'\")" \
  npx prisma db execute --stdin <<< "UPDATE users SET role = 'admin' WHERE email = 's83286263@gmail.com';"
```

실행 후 재로그인 필요 (NextAuth 세션 갱신).

## 14. 다음 단계

이 spec 문서가 승인되면 `writing-plans` 스킬로 넘어가 구현 계획을 작성한다. 계획은 위 신규/수정 파일 단위로 작업을 쪼개고, 검증 가능한 체크포인트를 둔다.
