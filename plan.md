# Snapshot Finance 개발 실행 계획

**작성일:** 2025-11-25
**최종 업데이트:** 2025-11-26
**목표:** Phase 1 MVP 완성 (3주)

---

## 📋 현재 상태

### ✅ 완료된 작업
- [x] PRD.md 작성 (제품 요구사항 정의)
- [x] CLAUDE.md 작성 (개발 가이드)
- [x] 프로젝트 디렉토리 생성
- [x] Next.js 프로젝트 초기화
- [x] 개발 환경 구축
- [x] 데이터베이스 설정 (Supabase PostgreSQL)
- [x] 백엔드 API 개발 완료
- [x] 프론트엔드 UI 개발 완료
- [x] GitHub 리포지토리 연동 및 Push

### ⏳ 다음 단계
- [ ] NH투자증권 API 연동 (선택)
- [ ] Vercel 배포
- [ ] Phase 2 기능 개발

---

## 🎯 Phase 1 MVP 목표

**목표:** 개인용 주식 포트폴리오 스냅샷 관리 시스템
**기간:** 3주
**핵심 기능:**
1. ✅ 수동 스냅샷 생성
2. ✅ 스냅샷 목록/상세 조회
3. ✅ 수익률 차트 시각화
4. ⏳ NH투자증권 API 연동 (선택)

---

## 📅 Week 1: 환경 구축 및 기본 인프라 ✅ 완료

### Day 1-2: Next.js 프로젝트 초기화

#### 1.1 Next.js 프로젝트 생성
```bash
npx create-next-app@latest snapshot-finance
```

**선택 옵션:**
- TypeScript: Yes ✅
- ESLint: Yes ✅
- Tailwind CSS: Yes ✅
- `src/` directory: No ❌
- App Router: Yes ✅
- Import alias (@/*): Yes ✅

#### 1.2 필요한 패키지 설치
```bash
cd snapshot-finance

# Prisma (ORM)
npm install prisma @prisma/client
npm install -D prisma

# UI 라이브러리
npm install @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react

# 차트 라이브러리
npm install recharts

# 테이블 라이브러리
npm install @tanstack/react-table

# 날짜 처리
npm install date-fns

# 금융 계산 (Decimal)
npm install decimal.js

# 환경변수 검증
npm install zod

# 폼 처리 (Phase 2에서 필요할 수 있음)
npm install react-hook-form @hookform/resolvers
```

#### 1.3 shadcn/ui 초기화
```bash
npx shadcn@latest init
```

**선택 옵션:**
- Style: Default
- Base color: Slate
- CSS variables: Yes

**필요한 컴포넌트 설치:**
```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add table
npx shadcn@latest add dialog
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add select
npx shadcn@latest add skeleton
npx shadcn@latest add toast
```

#### 체크리스트
- [x] Next.js 프로젝트 생성 완료
- [x] 모든 패키지 설치 완료
- [x] shadcn/ui 초기화 및 기본 컴포넌트 설치
- [x] `npm run dev` 실행하여 기본 화면 확인 (http://localhost:3000)

---

### Day 3-4: PostgreSQL 및 Prisma 설정

#### 2.1 Supabase PostgreSQL 설정

**Supabase 프로젝트 생성 및 연결 (Docker 대신 Supabase 사용)**

#### 2.2 환경변수 설정

**파일 생성: `.env.local`**
```env
# Database (Supabase - Session Mode Pooler)
DATABASE_URL="postgresql://postgres.xxx:password@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"

# API Keys (나중에 추가)
# NH_API_KEY=your_key_here
# CRON_SECRET=your_secret_here
```

#### 2.3 Prisma 초기화

```bash
npx prisma init
```

**Prisma 스키마 작성:** PRD.md Section 8.2의 전체 스키마 적용

#### 2.4 Prisma 마이그레이션 및 클라이언트 생성

```bash
# 마이그레이션 생성 및 실행
npx prisma migrate dev --name init

# Prisma 클라이언트 생성
npx prisma generate

# 시드 데이터 생성
npm run seed
```

#### 체크리스트
- [x] Supabase PostgreSQL 연결 완료
- [x] `.env.local` 파일 생성 및 DATABASE_URL 설정
- [x] Prisma 스키마 작성 완료
- [x] `npx prisma migrate dev` 성공
- [x] `lib/prisma.ts` 생성 완료
- [x] 시드 데이터 생성 완료

---

### Day 5-7: 프로젝트 구조 및 유틸리티 설정

#### 체크리스트
- [x] 프로젝트 디렉토리 구조 생성
- [x] TypeScript 타입 정의 완료
- [x] 금융 계산 유틸리티 함수 작성
- [x] 포맷팅 유틸리티 함수 작성

---

## 📅 Week 2: 백엔드 API 개발 ✅ 완료

### Day 8-10: 스냅샷 API 구현

#### 체크리스트
- [x] POST `/api/snapshots` 구현 (스냅샷 생성)
- [x] GET `/api/snapshots` 구현 (목록 조회, 커서 기반 페이지네이션)
- [x] GET `/api/snapshots/[id]` 구현 (상세 조회)
- [x] DELETE `/api/snapshots/[id]` 구현 (삭제)
- [x] GET `/api/stocks` 구현 (종목 목록)
- [x] curl로 API 테스트 완료

---

### Day 11-12: 시드 데이터 생성

#### 체크리스트
- [x] 시드 데이터 스크립트 작성
- [x] 주요 종목 마스터 데이터 생성 (삼성전자, SK하이닉스 등 10종목)
- [x] 테스트용 계좌 데이터 생성

---

### Day 13-14: NH투자증권 API 연동 (선택)

> **결정:** Phase 1에서는 수동 입력으로 진행. API 연동은 Phase 2에서 구현 예정.

#### 체크리스트
- [x] 수동 입력 방식 결정
- [x] 수동 입력 폼 UI 준비

---

## 📅 Week 3: 프론트엔드 UI 개발 ✅ 완료

### Day 15-17: 대시보드 페이지

#### 체크리스트
- [x] 레이아웃 구성 완료 (`app/dashboard/layout.tsx`)
- [x] 대시보드 페이지 구현 (`app/dashboard/page.tsx`)
- [x] PortfolioSummaryCard 컴포넌트 작성
- [x] ProfitRateChart 컴포넌트 작성 (Recharts)
- [x] 로컬 서버에서 대시보드 확인

---

### Day 18-19: 스냅샷 목록/상세 페이지

#### 체크리스트
- [x] 스냅샷 목록 페이지 구현 (`app/dashboard/snapshots/page.tsx`)
- [x] 스냅샷 상세 페이지 구현 (`app/dashboard/snapshots/[id]/page.tsx`)
- [x] HoldingsTable 컴포넌트 작성
- [x] 페이지 간 네비게이션 테스트

---

### Day 20-21: 스냅샷 생성 폼 (수동 입력)

#### 체크리스트
- [x] 스냅샷 생성 폼 UI 구현 (`app/dashboard/snapshots/new/page.tsx`)
- [x] 클라이언트 사이드 폼 제출 로직
- [x] 종목 선택 (Stock 테이블에서 조회)
- [x] 수량, 평균 매입가, 현재가 입력
- [x] 여러 종목 추가 기능
- [x] 예수금 입력
- [x] 요약 미리보기 표시
- [x] 생성 후 대시보드로 리다이렉트
- [x] 전체 플로우 테스트

---

## ✅ Phase 1 완료 체크리스트

### 환경 구축
- [x] Next.js 프로젝트 생성
- [x] PostgreSQL (Supabase) 연결
- [x] Prisma 마이그레이션 완료
- [x] 시드 데이터 생성

### 백엔드 API
- [x] POST `/api/snapshots` (생성)
- [x] GET `/api/snapshots` (목록)
- [x] GET `/api/snapshots/[id]` (상세)
- [x] DELETE `/api/snapshots/[id]` (삭제)
- [x] GET `/api/stocks` (종목 목록)

### 프론트엔드 UI
- [x] 대시보드 페이지
- [x] 스냅샷 목록 페이지
- [x] 스냅샷 상세 페이지
- [x] 스냅샷 생성 폼
- [x] 수익률 차트

### 테스트
- [x] API 엔드포인트 테스트
- [x] UI 기능 테스트
- [x] 전체 플로우 테스트

### Git & 배포
- [x] GitHub 리포지토리 연동
- [x] 기능별 커밋 완료 (5개 커밋)
- [x] Push 완료

---

## 🎉 Phase 1 MVP 완료!

**GitHub:** https://github.com/spungs/snapshot-finance

**커밋 히스토리:**
1. `chore: add dependencies and configure shadcn/ui`
2. `feat: setup Prisma schema and database configuration`
3. `feat: add utility functions and TypeScript types`
4. `feat: implement REST API endpoints`
5. `feat: implement dashboard UI with portfolio management`

---

## 🚀 바로 시작하기

```bash
# 클론
git clone https://github.com/spungs/snapshot-finance.git
cd snapshot-finance

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env.local
# .env.local 파일에 DATABASE_URL 설정

# Prisma 클라이언트 생성
npx prisma generate

# 개발 서버 실행
npm run dev
```

---

## 📚 참고 자료

- **PRD.md**: 전체 제품 요구사항
- **CLAUDE.md**: 개발 가이드 및 아키텍처
- **Prisma Docs**: https://www.prisma.io/docs
- **Next.js Docs**: https://nextjs.org/docs
- **shadcn/ui**: https://ui.shadcn.com

---

## 💡 다음 단계 (Phase 2)

Phase 1 완료 후:
1. [ ] 자동 스냅샷 스케줄러 (node-cron)
2. [ ] 시뮬레이션 기능 ("팔지 않았다면?")
3. [ ] Vercel 배포
4. [ ] NH투자증권 API 연동
5. [ ] 다중 계좌 지원

**Phase 1 MVP 완료! 🎉**
