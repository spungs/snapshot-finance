# CLAUDE.md

> **중요: 모든 응답은 반드시 한국어로 작성하세요.**

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고할 가이드를 제공합니다.

## 프로젝트 개요

**Snapshot Finance**는 주식 포트폴리오 스냅샷 관리 시스템으로 투자자가 다음을 수행할 수 있습니다:
- 특정 시점의 포트폴리오 스냅샷 저장
- 과거 수익률 및 성과 추적
- "만약에" 시뮬레이션 실행 (구현 완료)
- 주식 현재가 조회 및 자산 평가

이 시스템은 수동 구글 스프레드시트 기록을 자동화된 데이터베이스 기반 솔루션으로 대체합니다.

## 기술 스택

- **프론트엔드:** Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **UI 컴포넌트:** shadcn/ui, Recharts (차트), TanStack Table (데이터 테이블)
- **백엔드:** Next.js API Routes (Server Actions 포함)
- **인증:** NextAuth.js v5 (Google 로그인)
- **데이터베이스:** PostgreSQL + Prisma ORM (Supabase)
- **증권사 API:** KIS (한국투자증권) Open API (시세 조회용)
- **배포:** Vercel (호스팅) + Supabase (PostgreSQL)

## 개발 단계

**Phase 1 (MVP - 완료):** 개인용 잔고 관리, 스냅샷 CRUD, 실시간 시세 연동
**Phase 2 (진행 중):** 인증 및 사용자 관리, 시뮬레이션, 자동 스냅샷, UX 고도화
**Phase 3 (예정):** 다중 사용자 서비스 확장, 배당금 관리, 커뮤니티 기능

## 데이터베이스 아키텍처

### 핵심 데이터 모델

시스템은 **사용자(User)** 중심으로 포트폴리오와 스냅샷을 관리합니다:

```
User
  ├─ Holding (1:N) [실시간 잔고]
  │   └─ Stock (N:1)
  └─ PortfolioSnapshot (1:N) [불변 기록]
      └─ SnapshotHolding (1:N)
          └─ Stock (N:1)
```

### 주요 설계 원칙

1.  **스냅샷 불변성:** 생성된 스냅샷은 수정 불가(삭제만 가능)하여 기록의 신뢰성 보장
2.  **데이터 정확성:** 금융 계산엔 항상 `Decimal` 타입 사용
3.  **데이터 정규화:** `Stock` 테이블로 종목 정보 관리, `User` 테이블로 계정 통합 (기존 `SecuritiesAccount` 제거됨)
4.  **명확한 네이밍:** 스냅샷 내 보유 종목은 `SnapshotHolding`으로 명명하여 실시간 잔고(`Holding`)와 구분

### 중요 스키마 세부사항

-   **PortfolioSnapshot:** 특정 시점의 포트폴리오 상태(총보유액, 수익률 등) 저장
-   **SnapshotHolding:** 스냅샷 시점의 개별 종목 상태 (구 `StockHolding`)
-   **Holding:** 현재 사용자가 보유 중인 실시간 잔고
-   **Stock:** 종목 마스터 데이터
-   **User:** 사용자 계정 및 인증 정보

## 주요 구현 참고사항

### 금융 계산
항상 `decimal.js` 라이브러리 사용, JavaScript 네이티브 `number` 절대 사용 금지:

```typescript
import Decimal from 'decimal.js';

// 올바른 방법
const profitRate = new Decimal(currentValue)
  .minus(totalCost)
  .div(totalCost)
  .times(100);
```

### 스냅샷 생성
1.  사용자의 현재 잔고(`Holding`)를 기반으로 자동 생성하거나 수동 입력 가능
2.  생성 시점의 환율 및 주가 정보를 `SnapshotHolding`에 기록
3.  단일 트랜잭션으로 처리하여 데이터 무결성 보장

### 자동 스냅샷 (Cron)
-   Vercel Cron Jobs 활용
-   `GET /api/cron/daily-snapshot`: 매일 장 마감 후 실행
-   `GET /api/cron/weekly-snapshot`: 주간 요약

## API 설계 표준

-   **RESTful API:** `app/api/*` 경로 사용
-   **Server Actions:** 폼 제출 및 단순 데이터 변이(`app/actions.ts`)에 활용
-   **인증:** `auth()` 함수를 통해 세션 검증 후 접근 허용
-   **프록시:** `proxy.ts` (구 `middleware.ts`)를 사용하여 라우트 보호

## 보안 요구사항

1.  **환경 변수:** API 키, DB URL 등은 `.env` 파일로 관리 (커밋 절대 금지)
2.  **인증:** NextAuth.js를 통한 안전한 세션 관리
3.  **타입 안전성:** Prisma Client 및 TypeScript 엄격 모드 준수

## 개발 워크플로우

### 커밋 후 plan.md 업데이트 (필수)

기능 구현을 완료하고 커밋한 후에는 반드시 `plan.md` 파일을 업데이트해야 합니다:

1.  **체크리스트 업데이트:** 완료된 항목을 `[ ]`에서 `[x]`로 변경
2.  **현재 상태 업데이트:** "현재 상태" 섹션의 완료된 작업 목록 갱신
3.  **최종 업데이트 날짜:** 파일 상단의 날짜 갱신

### 커밋 메시지 컨벤션

-   `feat:` 새로운 기능 추가
-   `fix:` 버그 수정
-   `chore:` 빌드, 설정 변경
-   `docs:` 문서 수정
-   `refactor:` 리팩토링

**예시:**
```
feat: implement logout functionality
refactor: rename StockHolding to SnapshotHolding
```

### 🚫 금지 사항
-   커밋 메시지에 자동 생성 문구 포함 금지

## 참고 문서

-   **개발 계획:** `plan.md` 확인
-   **Prisma 스키마:** `prisma/schema.prisma` 확인

## 현재 상태

**상태:** Phase 2 진행 중 (리팩토링 및 고도화)
**GitHub:** https://github.com/spungs/snapshot-finance

### 최근 주요 변경 사항
-   `SecuritiesAccount` 모델 제거 및 `User` 통합
-   `StockHolding` → `SnapshotHolding` 리네이밍
-   `middleware.ts` → `proxy.ts` 변경
-   로그인/로그아웃 구현 완료
