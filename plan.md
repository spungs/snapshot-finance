# Snapshot Finance 개발 실행 계획

**작성일:** 2025-11-25  
**최종 업데이트:** 2025-12-07  
**목표:** 개인용 주식 잔고 관리 MVP (무료 플랜)

---

## 📋 현재 상태

### ✅ 완료된 작업
- [x] 프로젝트 초기 설정 (Next.js, Prisma, shadcn/ui)
- [x] 데이터베이스 설정 (Supabase PostgreSQL)
- [x] 스냅샷 CRUD API
- [x] 주식 검색 API (Yahoo Finance + KIS Master)
- [x] 스냅샷 목록/상세/수정 페이지
- [x] 다중 통화 지원 (KRW/USD)
- [x] 다국어 지원

### ⏳ 진행 예정
- [x] **잔고 중심 아키텍처로 전환** (MVP 핵심)
- [x] 주별 자동 스냅샷

---

## 🎯 MVP 핵심 기능 체크리스트

| # | 기능 | 상태 | 설명 |
|---|------|------|------|
| 1 | 통합 주식 잔고 관리 | ✅ | 실시간 잔고 테이블 + 관리 UI |
| 2 | 주식 검색 (현재가 조회) | ✅ | Yahoo Finance + KIS Master |
| 3 | 잔고에 주식 추가 (매입가 입력) | ✅ | Holdings API + UI |
| 4 | 잔고 표시 (수익률, 수익금) | ✅ | 대시보드 메인에 표시 |
| 5 | 전체 평가수익률/수익금 | ✅ | 잔고 상단 요약 카드 |
| 6 | 스냅샷 저장 (현재 잔고 기반) | ✅ | 버튼 클릭 + 주별 자동 |
| 7 | 스냅샷 목록 (최신순) | ✅ | /dashboard/snapshots |
| 8 | 스냅샷 상세 | ✅ | /dashboard/snapshots/[id] |
| 9 | 스냅샷 매입가 수정 | ✅ | /dashboard/snapshots/[id]/edit |

---

## 📅 구현 일정

### Phase 1: 잔고 중심 아키텍처 구현

#### Step 1: DB 스키마 변경
- [x] `Holding` 모델 추가 (prisma/schema.prisma)
- [x] 마이그레이션 실행: `npx prisma db push`

#### Step 2: Holdings API 구현
- [x] GET `/api/holdings` - 잔고 조회 (현재가 포함)
- [x] POST `/api/holdings` - 종목 추가
- [x] PATCH `/api/holdings/[id]` - 종목 수정
- [x] DELETE `/api/holdings/[id]` - 종목 삭제

#### Step 3: 대시보드 UI 변경
- [x] `/dashboard` 메인 → 잔고 관리 UI로 변경
- [x] 종목 검색 + 추가 기능
- [x] 잔고 테이블 (현재가, 수익률, 수익금)
- [x] 전체 평가 요약 카드
- [x] "스냅샷 저장" 버튼

#### Step 4: 스냅샷 로직 변경
- [x] POST `/api/snapshots` - 현재 잔고 기반으로 생성

#### Step 5: 주별 자동 스냅샷
- [x] `/api/cron/weekly-snapshot` 엔드포인트
- [x] Vercel Cron 설정 (매주 금요일 미국장 마감 30분 후, 4:30 PM ET)

### Phase 1.5: UX 개선 및 시뮬레이션 (완료)
- [x] 시뮬레이션 기능 (과거 시점 자산 가치 계산)
- [x] 과거 날짜 기준 스냅샷 생성 (환율/주가 이력 연동)
- [x] 중복 저장 방지 (더블 클릭 방지 및 로딩 처리)
- [x] 글로벌 로딩 UI 및 페이지 전환 UX 개선
- [x] 입력 폼 개선 (쉼표 포맷팅, 숫자 입력 등)
- [x] 테스트 스크립트 정리

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

## 📚 참고 문서

- **CLAUDE.md**: 개발 가이드 및 아키텍처
- **Prisma Docs**: https://www.prisma.io/docs
- **Next.js Docs**: https://nextjs.org/docs
- **shadcn/ui**: https://ui.shadcn.com
