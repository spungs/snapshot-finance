# Snapshot Finance 개발 실행 계획

**작성일:** 2025-11-25  
**최종 업데이트:** 2025-12-09  
**목표:** 개인용 주식 잔고 관리 MVP (무료 플랜)

---

## 📋 현재 상태

### ✅ 완료된 작업
- [x] 프로젝트 초기 설정 (Next.js, Prisma, shadcn/ui)
- [x] 데이터베이스 설정 (Supabase PostgreSQL)
- [x] 스냅샷 CRUD API
- [x] 주식 검색 API (Yahoo Finance + KIS Master)
- [x] 스냅샷 목록/상세/수정 페이지
- [x] 다중 통화 지원 (KRW/USD) (다국어 지원 포함)
- [x] **잔고 중심 아키텍처로 전환**
- [x] 주별 자동 스냅샷 (Cron)
- [x] 시뮬레이션 기능 구현
- [x] Vercel 배포 및 환경 이슈(DB 연결, 시간대, API 토큰) 해결

---

## 📅 향후 계획 (Phase 2: 고도화 및 최적화)

### 1. 데이터베이스 최적화
- [ ] **미사용 테이블 정리**: 현재 코드에서 쓰이지 않는 레거시 테이블 식별 및 제거
- [ ] **테이블 구조 리팩토링**: 
    - 중복 데이터 제거 (정규화)
    - 스냅샷과 홀딩스 간의 데이터 구조 효율화 (참조 관계 재설정 등)
    - `Stock` 테이블 메타데이터 관리 개선

### 2. 인증 및 계정 관리
- [ ] **로그인 기능 구현**: 
    - NextAuth.js (Auth.js) 도입
    - 소셜 로그인 (Google, GitHub 등) 또는 이메일 로그인
    - 기존 하드코딩된 `TEST_ACCOUNT_ID` 제거 및 세션 기반 연동
- [ ] **등급제 로직 제거**: 
    - 코드 내 남아있는 '무료/유료' 관련 조건문 및 로직 완전 삭제
    - `User` 테이블 내 불필요한 등급 관련 필드 정리

### 3. 사용자 경험 (UX/UI) 개선
- [ ] **UI/UX 폴리싱**:
    - 대시보드 로딩 속도 최적화 (캐싱 전략 도입)
    - 모바일 반응형 레이아웃 개선
    - 전반적인 디자인 테마 통일성 강화
- [ ] **편의 기능 추가**:
    - 보유 종목 정렬 및 필터링 기능
    - 직관적인 에러 메시지 및 토스트 알림 강화

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
# .env.local 파일에 DATABASE_URL, KIS API 키 등 설정

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
