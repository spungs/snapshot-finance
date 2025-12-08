# CLAUDE.md

> **중요: 모든 응답은 반드시 한국어로 작성하세요.**

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고할 가이드를 제공합니다.

## 프로젝트 개요

**Snapshot Finance**는 주식 포트폴리오 스냅샷 관리 시스템으로 투자자가 다음을 수행할 수 있습니다:
- 특정 시점의 포트폴리오 스냅샷 저장
- 과거 수익률 및 성과 추적
- "만약에" 시뮬레이션 실행 (예: "팔지 않았다면?")
- 증권사 API를 통한 스냅샷 자동 생성

이 시스템은 수동 구글 스프레드시트 기록을 자동화된 데이터베이스 기반 솔루션으로 대체합니다.

## 기술 스택

- **프론트엔드:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **UI 컴포넌트:** shadcn/ui, Recharts (차트), TanStack Table (데이터 테이블)
- **백엔드:** Next.js API Routes
- **데이터베이스:** PostgreSQL + Prisma ORM
- **증권사 API:**
  - Phase 1: NH투자증권 QV Open API
  - Phase 2: 한국투자증권 Open API
  - Phase 3: 마이데이터 API (사업자 등록 필요)
- **배포:** Vercel (호스팅) + Supabase (PostgreSQL)

## 개발 단계

**Phase 1 (MVP - 3주):** 개인용, 단일 계좌, 수동 스냅샷 생성
**Phase 2 (2주):** 구독 모델(Free/Pro/Max), 스냅샷 수량 제한, 유료 유저용 자동 스냅샷
**Phase 3 (4-6주):** 다중 사용자 서비스, 마이데이터 API 연동, 결제 연동

## 데이터베이스 아키텍처

### 핵심 데이터 모델

시스템은 포트폴리오 상태가 불변 레코드인 **스냅샷 기반** 아키텍처를 사용합니다:

```
User (Phase 3)
  └─ SecuritiesAccount (1:N)
      └─ PortfolioSnapshot (1:N) [불변]
          └─ StockHolding (1:N)
              └─ Stock (N:1)
```

### 주요 설계 원칙

1. **스냅샷은 불변** - 생성된 후에는 수정 불가 (삭제만 가능)
2. **Decimal 정밀도** - 모든 금융 계산은 반올림 오류를 피하기 위해 `Decimal` 타입 사용 (float 사용 금지)
3. **이력 보존을 위한 비정규화** - `StockHolding.currentPrice`는 스냅샷 시점의 가격을 저장 (정규화하지 않음)하여 과거 데이터 보존
4. **연쇄 삭제** - 스냅샷 삭제 시 관련된 보유 종목도 자동 삭제
5. **스냅샷 수량 제한** - 플랜별 최대 저장 개수 제한 (Free: 30, Pro: 125, Max: 250)
6. **자동화 제한** - 자동 스냅샷 기능은 유료 플랜 전용

### 중요 스키마 세부사항

- **PortfolioSnapshot:** 특정 시점의 총 평가액, 수익률, 예수금을 저장하는 핵심 테이블
- **StockHolding:** 스냅샷 내 개별 주식 포지션 (수량, 가격, 손익)
- **Stock:** 주식 메타데이터를 위한 마스터 테이블 (종목코드, 종목명, 시장)
- **Simulation:** (Phase 2) 가상 수익과 실제 수익을 비교하는 "만약에" 시나리오 저장

참고: 완전한 Prisma 스키마는 `PRD.md` 섹션 8.2 참조

## 증권사 API 연동 전략

### Phase 1: NH투자증권
- **플랫폼:** Windows 전용 (DLL 기반 COM 인터페이스)
- **해결 방법:** Windows에서 Python/Node 서버 실행, Next.js에 HTTP API로 노출
- **주요 API:** TR C8201 (계좌 잔고 조회)

### Phase 2+: REST API
- 한국투자증권: OAuth 2.0, REST API
- 마이데이터 API: 금융 당국 승인 + 사업자 등록 필요

### 중요한 제약사항
- 일일 API 호출 제한 가능 - 캐싱 구현 필요
- 무료 API는 지연 시세 제공 (15분 지연)
- 계좌번호는 데이터베이스에 AES-256 암호화 필수

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

// 잘못된 방법 - 부동소수점 오류 발생
const profitRate = ((currentValue - totalCost) / totalCost) * 100;
```

### 스냅샷 생성 흐름
1. 증권사 API를 호출하여 현재 포트폴리오 조회
2. Decimal 연산을 사용하여 수익률 계산
3. 단일 트랜잭션으로 `PortfolioSnapshot`과 `StockHolding` 레코드 생성
4. 기존 스냅샷 절대 수정 금지 - 항상 새로 생성

### 자동 스냅샷
- Vercel Cron Jobs를 통해 스케줄링 (매일 15:30 KST - 장 마감 후)
- 엔드포인트: `GET /api/cron/snapshot` (`CRON_SECRET` 인증 헤더 필요)
- 로컬 개발: 테스트용으로 `node-cron` 사용

## API 설계 표준

- **RESTful 규약:** 리소스 기반 URL
- **에러 응답:** `error.code` 및 `error.message`를 포함한 일관된 JSON 형식
- **페이지네이션:** 성능을 위해 커서 기반 (offset 방식 아님)
- **인증:** Phase 3 - NextAuth.js를 통한 JWT

에러 형식 예시:
```json
{
  "error": {
    "code": "SNAPSHOT_NOT_FOUND",
    "message": "스냅샷을 찾을 수 없습니다.",
    "details": {}
  }
}
```

## 보안 요구사항

1. **절대 커밋 금지:**
   - API 키 → `.env.local`에 저장
   - 계좌번호 (DB에 암호화 필수)
   - `CRON_SECRET` 토큰

2. **암호화:**
   - 계좌번호: 저장 전 AES-256 암호화
   - 프로덕션에서 HTTPS만 사용

3. **Prisma 보호:**
   - 자동 SQL 인젝션 방지
   - 파라미터화된 쿼리만 사용

## 프로젝트 구조 (구현 예정)

```
app/
  api/
    snapshots/route.ts       # 스냅샷 CRUD
    portfolio/route.ts       # 실시간 포트폴리오 조회
    simulation/route.ts      # Phase 2
    cron/snapshot/route.ts   # 일일 자동 스냅샷
  dashboard/
    page.tsx                 # 메인 대시보드
    snapshots/[id]/page.tsx  # 스냅샷 상세 보기
  simulations/               # Phase 2

lib/
  api/
    nh-securities.ts         # NH API 클라이언트
    mydata.ts                # Phase 3
  utils/
    calculations.ts          # 수익률 계산 (Decimal.js)
  prisma.ts                  # Prisma 클라이언트 싱글톤

prisma/
  schema.prisma             # 데이터베이스 스키마 (PRD.md 참조)
  migrations/               # 자동 생성
```

## 규제 및 법적 고려사항

- **마이데이터 사업자 등록:** Phase 3 다중 사용자 서비스를 위해 필수 (금융위원회 승인)
- **개인정보 보호:** 계좌번호는 민감 정보 - 저장 시 암호화 필수
- **금융거래법:** 사용자가 본인 계좌만 연결하도록 제한

## 피해야 할 일반적인 함정

1. **돈 계산에 부동소수점 사용 금지** - 항상 `Decimal` 타입 사용
2. **스냅샷 수정 금지** - 대신 새로 생성 (불변성)
3. **코드에 API 키 저장 금지** - 환경변수만 사용
4. **Phase 1 과도한 엔지니어링 금지** - MVP는 단순하게 유지 (단일 사용자, 기본 기능)
5. **API 호출 에러 처리 생략 금지** - 증권사 API는 실패하거나 rate-limit될 수 있음

## 개발 워크플로우

### 커밋 후 plan.md 업데이트 (필수)

기능 구현을 완료하고 커밋한 후에는 반드시 `plan.md` 파일을 업데이트해야 합니다:

1. **체크리스트 업데이트:** 완료된 항목을 `[ ]`에서 `[x]`로 변경
2. **현재 상태 업데이트:** "현재 상태" 섹션의 완료된 작업 목록 갱신
3. **최종 업데이트 날짜:** 파일 상단의 날짜 갱신

**예시:**
```markdown
# 변경 전
- [ ] POST `/api/snapshots` 구현 (스냅샷 생성)

# 변경 후
- [x] POST `/api/snapshots` 구현 (스냅샷 생성)
```

### 커밋 메시지 컨벤션

기능별로 커밋을 분리하고, 다음 형식을 따릅니다:

- `feat:` 새로운 기능 추가
- `fix:` 버그 수정
- `chore:` 빌드, 설정 변경
- `docs:` 문서 수정
- `refactor:` 리팩토링

**예시:**
```
feat: implement REST API endpoints

- GET/POST /api/snapshots - list and create snapshots
- GET/DELETE /api/snapshots/[id] - get detail and delete snapshot
```

### 🚫 금지 사항
- 커밋 메시지에 `Generated with Claude Code` 또는 `Co-Authored-By: Claude` 같은 자동 생성 문구 절대 포함 금지

## 참고 문서

- **완전한 요구사항:** `PRD.md` 참조 (종합 제품 요구사항 문서)
- **데이터베이스 스키마:** `PRD.md` 섹션 8.2 (Prisma 스키마)
- **API 명세:** `PRD.md` 섹션 11 (엔드포인트 상세)
- **개발 로드맵:** `PRD.md` 섹션 12 (단계별 구분)

## 현재 상태

**상태:** Phase 1 MVP 완료
**GitHub:** https://github.com/spungs/snapshot-finance
**다음 단계:** Vercel 배포, Phase 2 기능 개발 (시뮬레이션, 자동 스냅샷)

### Phase 1 완료 기능
- 대시보드 (포트폴리오 요약, 수익률 차트)
- 스냅샷 CRUD (생성/조회/삭제)
- 수동 스냅샷 입력 폼
- Supabase PostgreSQL 연동

완전한 개발 로드맵 및 진행 상황은 `plan.md`를 참조하세요.
