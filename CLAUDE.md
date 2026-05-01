# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **중요: 모든 응답은 반드시 한국어로 작성하세요.**

## 프로젝트 개요

**Snapshot Finance**는 주식 포트폴리오 스냅샷 관리 시스템으로 다음을 제공합니다:
- 특정 시점의 포트폴리오 스냅샷 저장 (불변 기록)
- 과거 수익률 및 성과 추적
- "만약에" 시뮬레이션 (구현 완료)
- 주식 현재가 조회 및 자산 평가 (KIS / Yahoo Finance)
- 종목 관련 뉴스 AI 요약

수동 구글 스프레드시트 기록을 자동화된 데이터베이스 기반 솔루션으로 대체합니다.

## 기술 스택

- **프론트엔드:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4
- **UI 컴포넌트:** shadcn/ui, Radix UI, Recharts, TanStack Table, dnd-kit, Sonner, Vaul
- **백엔드:** Next.js API Routes + Server Actions
- **인증:** NextAuth.js v5 (Google OAuth, Prisma Adapter)
- **데이터베이스:** PostgreSQL + Prisma ORM v7 (Supabase)
- **시세 API:** KIS (한국투자증권) Open API, Yahoo Finance (yahoo-finance2)
- **AI:** Google Generative AI (뉴스 요약)
- **Rate Limiting:** Upstash Redis (`@upstash/ratelimit`)
- **배포:** Vercel (호스팅) / Netlify (대체) + Supabase

## 주요 명령어

```bash
npm run dev         # 개발 서버 (Next.js)
npm run build       # 프로덕션 빌드 (prisma generate 포함)
npm run start       # 프로덕션 서버 실행
npm run lint        # ESLint
npm run seed        # prisma/seed.ts 실행 (초기 데이터)
npm run seed:kis    # KIS 종목 마스터 업데이트 (scripts/update-kis-master.ts)
npx prisma migrate dev --name <설명>  # 스키마 마이그레이션
npx prisma studio   # DB GUI
```

테스트 프레임워크는 현재 설정되어 있지 않습니다.

## 디렉토리 구조 (큰 그림)

```
app/                     # Next.js App Router
  ├─ actions.ts, actions/  # Server Actions (폼/변이용)
  ├─ api/                  # REST API 엔드포인트
  │   ├─ ai/, auth/, cron/, exchange-rate/
  │   ├─ holdings/, kis/, simulation/
  │   ├─ snapshots/, stocks/, user/
  ├─ dashboard/            # 인증 필요 영역 (홈/포트폴리오/스냅샷/시뮬레이션/설정)
  ├─ auth/, guides/, news/, privacy/, terms/
components/
  ├─ dashboard/            # 대시보드 전용 위젯 (차트/테이블 등)
  ├─ ui/                   # shadcn/ui 기반 공통 컴포넌트
  └─ main-nav, mobile-nav, site-header, site-footer 등 셸
lib/
  ├─ ai/                   # Gemini 호출 래퍼
  ├─ api/                  # 외부 API 클라이언트 (kis-client, yahoo, exchange-rate, circuit breaker)
  ├─ services/             # 도메인 서비스 (holding-service, snapshot-service)
  ├─ auth.ts, auth.config.ts  # NextAuth 설정
  ├─ prisma.ts             # PrismaClient 싱글톤
  ├─ ratelimit.ts          # Upstash 레이트리미터
  ├─ currency/, hooks/, i18n/, news/, utils/
prisma/
  ├─ schema.prisma, migrations/, seed.ts
scripts/                # 일회성 마스터 업데이트 스크립트
middleware.ts           # /dashboard/* 라우트 보호 (NextAuth)
```

## 데이터베이스 아키텍처

사용자(User) 중심으로 실시간 잔고와 불변 스냅샷을 분리해 관리합니다:

```
User
  ├─ Holding (1:N)              [실시간 잔고 — 가변]
  │   └─ Stock (N:1)
  └─ PortfolioSnapshot (1:N)    [불변 기록 — 수정 불가, 삭제만 가능]
      └─ SnapshotHolding (1:N)
          └─ Stock (N:1)
```

부수 모델: `Account`/`VerificationToken` (NextAuth), `Stock` (마스터), `KisStockMaster` (KIS 검색용), `ApiToken` (KIS 토큰 캐시), `CronLog` (크론 실행 기록), `NewsArticle` (AI 요약 캐시).

### 핵심 설계 원칙

1. **스냅샷 불변성:** `PortfolioSnapshot`/`SnapshotHolding`은 생성 후 수정하지 않음 (삭제만 허용)
2. **Decimal 타입 강제:** 모든 금액/수익률은 `@db.Decimal`로 저장, JS 측에서는 `decimal.js` 사용
3. **실시간 ↔ 스냅샷 분리:** `Holding`(현재) ↔ `SnapshotHolding`(특정 시점)
4. **다통화 대응:** `currency`(KRW/USD), `purchaseRate`(매입 시 환율), `exchangeRate`(스냅샷 시점 환율) 모두 저장

## 주요 구현 규칙

### 금융 계산 — `decimal.js` 필수

JavaScript 네이티브 `number`로 금액 계산 절대 금지:

```typescript
import Decimal from 'decimal.js';

const profitRate = new Decimal(currentValue)
  .minus(totalCost)
  .div(totalCost)
  .times(100);
```

### 스냅샷 생성

1. 사용자의 현재 `Holding` 기반 자동 생성 또는 수동 입력
2. 생성 시점의 환율 및 주가를 `SnapshotHolding`에 동결
3. **반드시 단일 트랜잭션**으로 처리 (스냅샷 + 모든 SnapshotHolding 원자적 생성)

### 자동 스냅샷 / Cron

- 일간 스냅샷: `GET /api/cron/daily-snapshot` (장 마감 후)
- 만료 사용자 정리: `GET /api/cron/delete-expired-users`
- 뉴스 업데이트: `GET /api/cron/news-update`
- 스케줄러: **Supabase pg_cron**이 관리 (참고: 최근 `vercel.json` 제거됨)
- 모든 실행 결과는 `CronLog` 테이블에 기록

### API / 인증 / 라우팅

- **REST:** `app/api/*` — 외부에서 호출되는 비-폼 엔드포인트
- **Server Actions:** `app/actions.ts`, `app/actions/` — 폼 제출 / 단순 변이
- **세션 검증:** 핸들러 내부에서 `auth()` 호출
- **라우트 보호:** `middleware.ts`가 `/dashboard/*` 매처에 NextAuth 적용
- **Rate Limiting:** 외부 API 호출 / 비용 큰 엔드포인트는 `lib/ratelimit.ts` 사용
- **외부 API 회복력:** Yahoo Finance는 `lib/api/yahoo-circuit-breaker.ts`로 차단기 패턴 적용

## 개발 워크플로우

### 커밋 후 plan.md 업데이트 (필수)

기능 구현 완료/커밋 후 `plan.md` 갱신:
1. 체크리스트 `[ ]` → `[x]`
2. "현재 상태" 섹션 갱신
3. 파일 상단의 최종 업데이트 날짜 갱신

### 커밋 메시지 컨벤션

- `feat:` 새 기능 / `fix:` 버그 수정 / `chore:` 빌드·설정 / `docs:` 문서 / `refactor:` 리팩토링 / `style:` 스타일

**예시:** `feat: implement logout functionality`

### 🚫 금지 사항

- 커밋 메시지에 자동 생성 문구 포함 금지 (예: Co-Authored-By, "Generated with..." 등)

## 참고 문서

- 개발 계획: `plan.md`
- 스키마: `prisma/schema.prisma`
- 광고/수익화 계획: `ad_plan_*.md`
- 추가 문서: `docs/`

## 현재 상태

- **단계:** Phase 2 진행 중 (인증/시뮬레이션/자동 스냅샷/UX 고도화)
- **GitHub:** https://github.com/spungs/snapshot-finance

### 최근 주요 변경

- 모바일 탭 셸 + 에디토리얼 디자인 시스템 도입
- `vercel.json` 제거 (cron은 Supabase pg_cron이 관리)
- 차트 컴파일 오류 수정 및 디자인 시스템 정렬
- 테마 토글을 사용자 아이콘 옆으로 이동
- `SecuritiesAccount` 제거 → `User`로 통합
- `StockHolding` → `SnapshotHolding` 리네이밍
- 로그인/로그아웃 구현 완료


### 다음 작업들(개인 기록용, AI는 몰라도됨)
1. 변경된 파일들 모두 분석해서 커밋메세지 만들고 커밋해.
2. 스냅샷 메뉴 맨 하단에 빈 공간 여전히 있음. 캡쳐
3. 