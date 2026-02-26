# Snapshot Finance

**Snapshot Finance**는 투자자가 주식 포트폴리오 스냅샷을 관리할 수 있도록 돕는 시스템입니다. 과거 수익률 및 성과 추적, "만약에" 시뮬레이션, 그리고 주식 현재가 조회 및 자산 평가 기능을 통해 기존의 수동 구글 스프레드시트 기록을 자동화된 데이터베이스 기반 솔루션으로 대체합니다.

## 주요 기능

- **포트폴리오 스냅샷:** 특정 시점의 포트폴리오 상태 저장 (데이터의 불변성을 보장하여 기록의 신뢰성 유지)
- **과거 수익률 및 성과 추적:** 스냅샷 간의 성과 비교
- **시뮬레이션 ("만약에"):** 가상의 시나리오를 바탕으로 한 포트폴리오 수익률 시뮬레이션
- **주식 현재가 조회:** 한국투자증권(KIS) Open API를 연동하여 실시간 시세 조회 및 자산 평가
- **자동 스냅샷:** 크론(Cron) 작업을 통한 일간 매일 장 마감 후 및 주간 자동 스냅샷 생성

## 기술 스택

- **프론트엔드:** Next.js 16 (App Router), TypeScript, Tailwind CSS
- **UI/UX:** shadcn/ui, Recharts (차트), TanStack Table (데이터 테이블)
- **백엔드:** Next.js API Routes (Server Actions 활용)
- **인증:** NextAuth.js v5 (Google 로그인 제공)
- **데이터베이스:** PostgreSQL + Prisma ORM (Supabase 운영)
- **외부 API:** KIS (한국투자증권) Open API (시세 조회)
- **배포:** Vercel / Netlify

## 시작하기 (Getting Started)

### 환경 변수 설정
프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 필요한 환경 변수(DB 접속 정보, NextAuth Secret, KIS API 설정 등)를 입력해야 합니다. (*주의: API 키, DB URL 등은 `.env` 파일로 관리하며, 절대 저장소에 커밋하지 않습니다.*)

### 개발 서버 실행

```bash
npm install
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

터미널에서 명령어 실행 후, 브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속하여 결과를 확인할 수 있습니다.

## 핵심 데이터베이스 아키텍처

사용자(User)를 중심으로 포트폴리오와 스냅샷을 관리하는 구조를 가집니다:

```text
User
  ├─ Holding (1:N) [실시간 잔고]
  │   └─ Stock (N:1)
  └─ PortfolioSnapshot (1:N) [불변 기록]
      └─ SnapshotHolding (1:N)
          └─ Stock (N:1)
```

- `PortfolioSnapshot`: 특정 시점의 포트폴리오 상태(총보유액, 수익률 등) 저장
- `SnapshotHolding`: 스냅샷 시점의 개별 종목 상태 (구 StockHolding)
- `Holding`: 현재 사용자가 보유 중인 실시간 잔고
- `Stock`: 종목 마스터 데이터
- `User`: 사용자 계정 및 인증 정보
