# Snapshot Finance — 상용화 배포 전 정밀 검수 리포트

> 검수일: 2026-06-11
> 검수 범위: 보안 / 빌드·품질 / 금융 데이터 정합성 / 외부 API 회복력·에러처리 / 법적·SEO·PWA·접근성
> 방식: 자동 검사(build·type·lint·audit) + 영역별 코드 정밀 검토(읽기 전용)
> 대상 커밋: `0b67f85` (main)
> **2026-06-12 업데이트: 배포 차단 3건 모두 수정 완료 (아래 "수정 반영" 참조)**

---

## ✅ 수정 반영 (2026-06-12)

| Blocker | 조치 | 검증 |
|---|---|---|
| **B-1** Next.js 취약점 | `next` 16.0.7 → **16.2.9** 업그레이드 (+ `eslint-config-next`) | 빌드·타입·lint 통과 |
| **B-2** 마이그레이션 drift | 깨진 `manual/` 폴더를 `prisma/_manual_migrations_archive/`로 격리(README 동봉) | 운영 `migrate status` = **"up to date"** (reset/데이터손실 위험 해소). 새 환경 재현용 unify 정식 편입은 운영 안전성 우선으로 **보류**(현 상태 유지 결정) |
| **B-3** 에러 바운더리 | `app/global-error.tsx` · `app/dashboard/error.tsx` · `app/not-found.tsx` · `app/dashboard/snapshots/[id]/not-found.tsx` 추가 | 빌드 통과, 스냅샷 not-found는 기존 `notFound()`와 연결 |

→ **배포 차단 요소 해소.**

### 권장 조치 처리 (2026-06-12)

비차단 권장 조치도 다음과 같이 반영 완료 (전체 풀빌드·타입체크·lint 통과):

| 항목 | 조치 |
|---|---|
| #1 `lang="ko"` | `app/layout.tsx` 적용 |
| #2 daily-snapshot `maxDuration` | `export const maxDuration = 60` 추가 |
| #3 `stocks/search` 인증 | `auth()` 가드 추가 (호출처는 모두 대시보드 내부) |
| #4 `.env.example` | 키·용도 문서화 + `.gitignore` 예외(`!.env.example`) |
| #5 KIS fetch 타임아웃 | `fetchWithTimeout`(AbortSignal.timeout 5s) 래퍼로 8개 fetch 일괄 적용 |
| #6 getDailyPrice US | Yahoo `historical()` → KIS `getDailyPriceRange`(HHDFS76240000) 위임, EXCD 추론 |
| #7 exchange-rate rate limit | `ratelimit.api` IP 제한 추가 |
| #8 스냅샷 정정 | "수정 유지" 결정(자동 스냅샷 정정 필요) → CLAUDE.md 원칙 3곳 갱신 |

**미처리(의도적 보류):** CSP 도입(#10, GSI·SW 호환 검증 필요)·cron `timingSafeEqual`(#11, 실위험 낮음)·동시성 트랜잭션(#12, 확률 낮음)·`removeConsole`/DB덤프 정리(#13)·AdSense `<ins>` 유닛(#9, 수익화 결정 필요).

---

아래는 검수 시점(수정 전) 원본 진단 내용이다.

---

## 종합 판정

| 구분 | 결과 |
|---|---|
| **상용 배포 가능 여부** | ⚠️ **조건부 — 배포 차단(Blocker) 3건 해소 후 배포 권장** |
| 전체 위험도 | MEDIUM |
| 검사 항목 | 28개 |
| PASS | 16 |
| 미흡(WARN) | 9 |
| 위험(FAIL/Blocker) | 3 |

코드 품질의 **기반(인증·인가·IDOR·입력검증·금융계산·시크릿관리·AI 인젝션 방어)은 전반적으로 모범적**입니다.
다만 아래 **3건의 배포 차단 이슈**는 운영 안정성·보안·데이터 안전에 직접 영향을 주므로 배포 전 처리를 강력 권고합니다.

---

## 🚫 배포 차단(Blocker) 3건

### B-1. Next.js 16.0.7 알려진 HIGH 취약점 — 미들웨어/프록시 우회 포함  〔보안〕
- **판정: FAIL**
- **근거:** `package.json` `"next": "16.0.7"`. `npm audit` 결과 next에 HIGH 다수 — 특히
  - `Next.js: null origin can bypass Server Actions CSRF checks` (이 앱은 Server Actions 전면 사용)
  - `Next.js Middleware / Proxy bypass in App Router` 계열 다수 (이 앱은 `middleware.ts`로 `/dashboard/*` 인증 보호)
  - Server Actions 소스 코드 노출, 다수 DoS
- **위험:** 인증·CSRF 보호가 플랫폼 레벨에서 우회될 수 있음 (OWASP A01/A06).
- **조치:** `next`를 **16.2.9**(최신 16.x)로 업그레이드 → `npm i next@16.2.9 eslint-config-next@16.2.9` 후 `npm run build` 검증. (메이저 변경 아님, 호환성 위험 낮음.)

### B-2. Prisma 마이그레이션 drift — 운영 외 환경 migrate 시 reset/데이터손실  〔금융 정합성〕
- **판정: FAIL**
- **근거:** `prisma/schema.prisma` ↔ `prisma/migrations/` 불일치 (파일 레벨 확정):
  - `Stock` 모델 통합(`stockCode` PK 재배선 + `holdings.stockCode` FK + `kis_stock_masters` 폐기)이 **`prisma/migrations/manual/unify-stocks.sql`에만** 존재 → `manual/` 하위라 Prisma history가 인식 못 함.
  - tracked 마이그레이션은 여전히 `kis_stock_masters` 테이블을 **생성**하는데 현재 schema엔 그 모델이 없음(유령 테이블).
  - schema에 있으나 **어떤 마이그레이션에도 없는 컬럼:** `users.targetAsset`, `users.role`, `portfolio_snapshots.exchangeRate`.
- **위험:** 운영 외 환경에서 `npx prisma migrate dev` 실행 시 **drift 감지 → DB reset 유도(데이터 손실)**. CLAUDE.md에 명시된 `bf535ec` displayOrder 잠복 사고와 동형.
- **조치:** 운영 DB의 실제 스키마를 baseline으로 history 재정합(현 운영 상태를 `--create-only`로 캡처해 흡수 + `manual/unify-stocks.sql`을 정식 마이그레이션화). **재정합 전까지 신규 schema 변경/마이그레이션 금지.**

### B-3. 에러 바운더리 전무 — 서버 throw 시 raw 에러 화면 노출  〔API 회복력〕
- **판정: FAIL**
- **근거:** `app/` 전체에 `error.tsx` / `global-error.tsx` / `not-found.tsx` **0건** (`loading.tsx`만 12개).
- **위험:** 서버 컴포넌트(홈·스냅샷 상세 등)에서 DB/시세 조회가 throw하면 Next.js 기본 화면(프로덕션: "Application error: a server-side exception")이 그대로 노출. 존재하지 않는 스냅샷 접근 시 기본 404. 상용 서비스 품질 미달.
  - (참고: 서버 액션·API 라우트의 try/catch는 양호 → 사용자 대상 raw 노출은 서버 컴포넌트 경로에 한정.)
- **조치:** 최소 `app/global-error.tsx` + `app/dashboard/error.tsx` + `app/dashboard/snapshots/[id]/not-found.tsx` 추가.

---

## ✅ 자동 검사 결과

| 검사 | 명령 | 결과 |
|---|---|---|
| 프로덕션 빌드 | `npm run build` | ✅ PASS (exit 0) |
| 타입 체크 | `npx tsc --noEmit` | ✅ PASS (exit 0) |
| Lint | `npx eslint .` | ✅ PASS (exit 0, 경고/에러 없음) |
| 의존성 취약점 | `npm audit` | ❌ HIGH 2 / moderate 7 (B-1 참조) |

### 의존성 취약점 상세
| 패키지 | 등급 | 경로 | 런타임 영향 | 비고 |
|---|---|---|---|---|
| `next` 16.0.7 | **HIGH** | 직접 의존 | **있음** | B-1 — 최우선 |
| `js-cookie` ≤3.0.5 | HIGH | `pwa-asset-generator`(devDep) → 일회성 아이콘 생성 | 없음 | 런타임/빌드 번들 무관, 후순위 |
| `hono` ≤4.12.20 | moderate | `prisma`(devDep) 내부 | 없음 | 후순위 |
| `ws` 8.x | moderate | 워커/transitive | 낮음 | 워커 점검 시 갱신 |
| `brace-expansion`, `postcss` | moderate | transitive | 없음 | 후순위 |

---

## 🔒 1. 보안 — 위험도 MEDIUM (Blocker 1: B-1)

| 항목 | 판정 | 요지 |
|---|---|---|
| 1.1 시크릿 노출 | ✅ PASS | 추적된 `.env` 없음, 하드코딩 시크릿 없음, 모두 `process.env`. `NEXT_PUBLIC_`은 Supabase anon key(공개 의도)뿐 |
| 1.2 인증/인가·IDOR | ✅ PASS | 모든 변이/조회 핸들러 `auth()` 검증, 모든 `[id]` 리소스 소유권(`userId`) 확인. IDOR 견고 |
| 1.3 입력 검증 | ✅ PASS | `lib/validation`이 수량·평단·예수금·통화·종목명 상하한/음수/NaN 차단. raw query 2곳 모두 파라미터 바인딩. XSS escape 처리 |
| 1.4 Rate Limiting | ⚠️ WARN | AI/OCR/검색/시뮬에 적용. 단 **fail-open**(Upstash 장애 시 무력화), `exchange-rate`는 미적용 |
| 1.5 AI 프롬프트 인젝션 | ✅ PASS | AI 출력이 **직접 DB 변이 불가** — 사용자 명시 확인 후 별도 인증 API가 재검증 실행. 다층 방어 |
| 1.6 민감정보 로깅 | ✅ PASS | 토큰/세션/PII 로깅 없음. 사용자 에러는 generic 메시지 |
| 1.7 보안 헤더/CORS/CSP | ⚠️ WARN | `X-Frame-Options`·`nosniff`·`Referrer-Policy`·`Permissions-Policy` 적용, same-origin. **CSP는 의도적 미적용** → Report-Only 도입 권장 |

부가 권장: 루트의 DB 덤프(`prod_dump_*.sql`, `dev_backup_*.sql`)는 git 미추적이나 실제 사용자 데이터이므로 안전 위치로 이동/삭제. cron 인증을 `crypto.timingSafeEqual`로 강화(현재 평문 비교, 실위험 낮음).

---

## 💰 2. 금융 데이터 정합성 (Blocker 1: B-2)

| 항목 | 판정 | 요지 |
|---|---|---|
| 2.1 Decimal 강제 | ✅ PASS | 모든 금액·수익률이 `decimal.js`. native number 산술 0건. (Decimal 전역 precision 미설정은 경미) |
| 2.2 스냅샷 불변성 | ⚠️ WARN | **PUT 수정 라우트가 살아있고 edit 페이지에 배선됨** → 과거 스냅샷 사후 수정 가능. CLAUDE.md 원칙 #1과 충돌(트랜잭션 원자성 자체는 정상). "불변 기록" 제품 약속 위반 — 제품 결정 필요 |
| 2.3 환율 규칙 | ✅ PASS | totalValue=현재/스냅샷 환율, totalCost=purchaseRate 동결. 섞임 없음, legacy(=1) 폴백 일관 |
| 2.4 마이그레이션 drift | ❌ **FAIL** | **B-2** |
| 2.5 0원/null 방어 | ✅ PASS | 0/비유한값 throw·skip, >50% 실패 시 abort, `isZero()` 가드 일관. NaN/Infinity 차단 |
| 2.6 동시성 | ⚠️ WARN | `createHolding`/`updateHolding` merge가 비트랜잭션 read-then-write → 동일 종목 동시 추가 시 수량 유실 가능(확률 낮음). `$transaction` 권장 |

---

## 🌐 3. 외부 API 회복력·에러 처리·라우팅 (Blocker 1: B-3)

| 항목 | 판정 | 요지 |
|---|---|---|
| 3.1 외부 API 장애 대응 | ⚠️ WARN | 환율 3소스 폴백+타임아웃 모범적. **단 KIS fetch에 타임아웃 전무**(서버 hang 시 무한 대기). `yahoo-circuit-breaker`는 **dead code**이고 `getDailyPrice` US가 Yahoo `historical()` 사용 → MEMORY의 "US 과거시세 Yahoo 금지(429)" 위반 |
| 3.2 에러 바운더리 | ❌ **FAIL** | **B-3** |
| 3.3 라우트 보호 일관성 | ⚠️ WARN | `/dashboard/*` 이중 보호, API 대부분 401 가드. **단 `stocks/search`는 미인증 공개** → 익명 외부 API 쿼터 소진 위험 |
| 3.4 KIS 토큰 관리 | ✅ PASS | DB 캐시+만료버퍼+in-flight dedup, EGW00123/EGW00201 재시도, 청크 throttle로 초당 20건 대응 |
| 3.5 크론 안정성 | ⚠️ WARN | daily-snapshot 견고(개별 skip, >50% abort, CronLog). **단 `maxDuration` 미설정** → 사용자 증가 시 timeout으로 스냅샷 누락 우려 |
| 3.6 로딩/스켈레톤 UX | ✅ PASS | loading.tsx 12개, SWR stale 무한표시 이슈 정정됨(`revalidateOnMount`), 영속 캐시 견고 |
| 3.7 빌드 시 크래시 위험 | ✅ PASS | Upstash `https` 가드, Gemini null 가드 — 모듈 top-level 크래시 방어됨(과거 Sensitive env 이슈 반영) |

---

## 📄 4. 법적·SEO·PWA·접근성 — Blocker 없음

| 항목 | 판정 | 요지 |
|---|---|---|
| 4.1 법적 고지 | ✅ PASS | 약관·개인정보처리방침 충실(투자 면책·만14세·30일 파기·쿠키/AdSense 고지), 탈퇴→soft delete→cron 정리 동작 일치, ko/en |
| 4.2 SEO/메타 | ⚠️ WARN | metadata·OG·robots·sitemap 충실. **`<html lang="en">`인데 콘텐츠는 한국어** → `lang="ko"` 권장. sitemap 자기참조 순환, `siteUrl` vercel.app 하드코딩 |
| 4.3 PWA | ✅ PASS | manifest·SW(Serwist)·아이콘·apple splash 정상. (maskable 아이콘 미지정은 경미) |
| 4.4 접근성 | ✅ PASS | 수익/손실에 색상+부호/화살표 병기(색맹 대응), aria-pressed/selected/label 다수 적용 |
| 4.5 환경변수 문서화 | ⚠️ WARN | **`.env.example` 부재**, README에 키 목록 없음 → 재배포 시 침묵 실패 위험 |
| 4.6 AdSense/광고 | ⚠️ WARN | ads.txt·로더 정상(성능 영향 낮음). **단 렌더링되는 `<ins>` 광고 유닛 부재** → 수익화 목표면 슬롯 배치 필요 |
| 4.7 콘솔/디버그 잔재 | ⚠️ WARN | TODO/FIXME 0건, 하드코딩 test값 0건. console.log 150건은 **대부분 서버사이드**(브라우저 번들 무관, Vercel 함수 로그 오염). `removeConsole` 권장 |

---

## 📋 배포 전 권장 조치 (Blocker 외 · 우선순위순)

1. **[보안]** `next` 16.2.9 업그레이드 (= B-1, 최우선)
2. **[API]** `daily-snapshot` cron에 `export const maxDuration = 60` 추가
3. **[API/보안]** `app/api/stocks/search`에 `auth()` 가드 추가
4. **[금융]** 스냅샷 PUT/edit 라우트 — "불변 기록" 유지 여부 **제품 결정** (제거 vs 원칙 갱신)
5. **[API]** KIS fetch 전반에 `AbortController`(3~5s) 타임아웃
6. **[API]** `getDailyPrice` US 경로를 KIS로 교체(또는 yahoo-circuit-breaker 실제 배선)
7. **[SEO]** `app/layout.tsx` `lang="en"` → `lang="ko"` (1줄)
8. **[운영]** `.env.example` 추가(키 이름만), DB 덤프 `.sql` 루트에서 이동/삭제
9. **[보안]** `exchange-rate`에 IP rate limit, CSP Report-Only 도입, cron `timingSafeEqual`
10. **[품질]** `next.config.ts`에 `compiler.removeConsole`(error/warn 제외) 추가

---

## 결론

- **인증·인가·IDOR·입력검증·금융계산·시크릿·AI 인젝션 방어** = 상용 수준의 견고함. 제품의 보안/데이터 기반은 신뢰할 만함.
- **배포 차단 3건(B-1 의존성 / B-2 마이그레이션 drift / B-3 에러 바운더리)** 은 각각 보안·데이터안전·서비스품질의 직접 리스크이므로 **해소 후 배포**를 권고.
- B-1·B-3은 수 시간 내 처리 가능. B-2(마이그레이션 history 재정합)는 운영 DB를 다루므로 신중한 별도 작업 권장.
- 법적·PWA·접근성은 차단 이슈 없이 배포 가능 수준.

> 본 리포트는 정적 코드 분석 + 자동 검사 기반이며, 운영 DB 상태·실트래픽 부하·외부 API 실장애는 별도 스테이징 검증을 권장합니다.
