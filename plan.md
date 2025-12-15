# Snapshot Finance 개발 실행 계획

**작성일:** 2025-11-25  
**최종 업데이트:** 2025-12-15 (Guide Content Corrections)  
**목표:** 개인용 주식 잔고 관리 MVP (무료 플랜)

---

## 📋 현재 상태

### ✅ 완료된 작업
#### 1. 핵심 기능 및 아키텍처
- [x] 프로젝트 초기 설정 (Next.js, Prisma, shadcn/ui)
- [x] 데이터베이스 설정 (Supabase PostgreSQL)
- [x] **잔고 중심 아키텍처로 전환**
- [x] 스냅샷 CRUD API 및 페이지 (목록/상세/수정)
- [x] 주식 검색 API (Yahoo Finance + KIS Master)
- [x] 다중 통화 지원 (KRW/USD) 및 다국어 지원
- [x] 시뮬레이션 기능 구현
- [x] 주별 자동 스냅샷 (Cron)

#### 2. 인증 및 사용자 관리
- [x] **로그인 기능 구현** (NextAuth.js v5 - Google)
- [x] 기존 하드코딩 `TEST_ACCOUNT_ID` 제거 및 세션 연동
- [x] 로그아웃 기능 구현

#### 3. 데이터베이스 리팩토링 및 최적화
- [x] **사용자 모델 단일화**: `SecuritiesAccount` 모델 제거 및 `User` 모델로 통합
- [x] **스키마 정리**:
    - 미사용 `Simulation` 테이블 제거
    - 미사용 `StockHistory` 테이블 제거
    - `StockHolding` → `SnapshotHolding` 모델명 변경 (명확성 향상)
- [x] **불필요한 로직 제거**: 등급제(무료/유료) 관련 코드 완전 삭제

- [x] 스냅샷 상세 페이지 정렬/필터 구현
- [x] UI/UX 개선 (헤더 레이아웃, 버튼 스타일 등)
- [x] 커스텀 정렬 기능 구현 (Drag & Drop)
- [x] **성능 최적화**: 보유 종목 조회 병렬 처리 및 인덱스(`userId`, `displayOrder`) 추가

#### 4. 기타 유지보수
- [x] Next.js 16 호환성 업데이트 (`middleware.ts` → `proxy.ts`)
- [x] Vercel 배포 환경 이슈 해결 (DB 연결, 시간대, 환경변수)
- [x] **배포 환경 이전**: Vercel -> Netlify (Next.js Runtime v5, Scheduled Functions)
- [x] **Cron 표준화**: (Vercel) `vercel.json` 크론 1개(`daily-snapshot`)로 완전 통합 - *Free Plan 최적화*
- [x] **Snapshot 로직 고도화**: 단순 복사 -> **매일 실시간 시세 조회(Fetch)** 방식으로 업그레이드
- [x] **스케줄링**: 월~금(UTC) 스냅샷 생성 / 매일 유저 정리 자동화
- [x] **Weekly Snapshot 최적화**: 금요일 22:30 UTC (토요일 07:30 KST) 실행 및 중복 방지 로직 추가
- [x] 구글 애드센스 검증 파일 추가 (`ads.txt`)
- [x] 구글 애드센스 검증 파일 추가 (`ads.txt`)
- [x] 구글 애드센스 검증 파일 추가 (`ads.txt`)
- [x] 스냅샷 목록 버그 수정 (사용자 ID 연동)
- [x] [Bug] Korean Search: Korean stock names not found (Result: "Invalid Search Query") -> Fixed with full KIS master seed and improved fallback
- [x] [UX] Delete Holding: Disable row and show loading state during deletion)
- [x] [Fix] Build Error: Fix type mismatch in i18n context (`t` function)
- [x] [Fix] KIS API Token 자동 갱신: 토큰 만료 시 자동으로 재발급 및 재시도 로직 구현
- [x] [Docs] 가이드 콘텐츠 수정: 수익률 표 순수익 기준 변경 및 양도소득세 공제 내용 추가

---

## 📅 향후 계획 (Phase 2: 고도화 및 UX 개선)

### 1. 사용자 경험 (UX/UI) 개선
- [x] **보유 종목 정렬 및 필터링** (대시보드 & 스냅샷 상세)
- [x] **커스텀 정렬**: 드래그 앤 드롭으로 종목 순서 변경
- [x] **다국어 처리(i18n)**: 한국어/영어 지원 및 UI 최적화 완료 (랜딩 페이지, 개인정보처리방침 포함)
- [x] **랜딩 페이지 리팩토링**: 개인화된 스토리텔링 및 카피라이팅 개선
- [x] **개인정보처리방침 업데이트**: AdSense 및 쿠키 정책 반영, 스마트 뒤로가기 버튼(내부 이동 감지 및 리디렉션 로직) 구현
- [ ] **대시보드 고도화**:
    - 자산 추이 그래프 시각화 개선
    - [x] 로딩 속도 최적화 (React Server Components 활용 및 캐싱)
    - [x] **종목 검색 최적화**: 디바운싱(2초) 및 수동 검색 트리거(Enter/Click) 적용
    - [x] **예수금(Cash Balance) 관리**:
        - [x] Database Schema Update (User.cashBalance)
        - [x] UI: 대시보드에서 예수금 직접 수정 (천단위 포맷팅, 다국어/통화 자동 변환)
        - [x] UX: 수정 시 로딩 상태 표시 및 즉각적인 UI 반영
        - [x] 다국어 지원: 주식 평가액, 예수금, 평가손익(투자) 라벨 및 메시지 처리
    - [x] **모바일 반응형 레이아웃 디테일 수정**: 
        - [x] 모바일용 카드 뷰(Card View) 구현 완료 (보유 종목, 스냅샷 목록)
        - [x] 대시보드 헤더 및 포트폴리오 요약 카드 모바일 최적화
        - [x] 모바일 목표 자산 설정 UI 개선 (레이아웃 틀어짐 수정)
- [x] **PC/태블릿 반응형 개선**: 포트폴리오 요약 카드 그리드 구조 개선
- [x] **UI 클린업**: 중복된 스냅샷 전체보기 링크 제거, 랜딩 페이지 중복 버튼 제거 및 UX 단순화
- [x] **커스텀 파비콘(Favicon) 구현**: icon.tsx 및 apple-icon.tsx 추가
- [x] **디자인 통일성**: 전반적인 컴포넌트 및 테마 스타일링 개선
- [x] **버그 수정**: 종목 추가 시 목록 미갱신 문제 해결 (캐시 무효화 및 상태 관리 수정)
- [x] **UI/UX 개선**: 글로벌 푸터 추가 (저작권 및 개인정보처리방침 링크)
- [x] **대시보드 레이아웃**: Sticky Header 및 Global Footer 통합 적용
- [x] **계정 관리**: 회원 탈퇴(계정 삭제) 기능 구현 (모바일 네비게이션 통합 완료)
- [x] **모바일 사용성 개선**: 시뮬레이션 스냅샷 선택 셀렉터 텍스트 말줄임 처리
- [x] **시크릿 어드민 모드**:
    - [x] 로고 10회 탭으로 실행되는 숨겨진 데이터 등록 기능 구현
    - [x] 엑셀/텍스트 붙여넣기를 통한 대량 보유 종목 등록 (Smart Parser)
    - [x] 다국어(i18n) 지원 및 예수금 직접 수정 기능

- [x] **이자 3% 환산 원금 툴팁**:
    - [x] 사용자가 설정 가능한 이자율(Persisted in LocalStorage)
    - [x] 수익금을 예금 원금으로 환산하여 시각화 (동기부여 요소)
- [x] **목표 자산 설정**: 목표 금액 설정 및 달성률 시각화
- [x] **목표 달성 축하 효과**:
    - [x] 달성 시 배너 표시 및 폭죽 애니메이션 (canvas-confetti)
    - [x] 새로운 목표 설정 유도 UX

### 3. 안정성 및 테스트
- [x] **API 호출 최적화**: 로고 클릭 시 대시보드 새로고침(Link) 차단하여 불필요한 API 비용(KIS) 절감 (PC/Mobile)
- [x] **인증 UX 개선**: Netlify 배포 환경에서 Google 로그인 시 계정 선택 및 재로그인 강제 (`prompt: login select_account`)
- [x] **로그아웃 안정성**: Netlify 환경에서 세션 쿠키가 삭제되지 않는 문제(Zombie Session) 해결 (서버 액션에서 강제 삭제)
- [x] **포트폴리오 비교 개선**:
    - [x] 스냅샷 목록 'Clear'(해제) 버튼 추가 및 선택 로직 개선
    - [x] 비교 화면 종목명 표시 형식 변경: '종목명 (티커)'
- [x] **시뮬레이션 결과 개선**:
    - [x] 결과 테이블 '비중'(Weight) 컬럼 추가 (소수점 1자리)
    - [x] 비중 계산 로직 수정 (단일 통화 기준 통일)
- [ ] **에러 핸들링 강화**: 사용자 친화적인 에러 메시지 및 토스트 알림
- [ ] **단위/통합 테스트**: 주요 비즈니스 로직(수익률 계산 등) 테스트 코드 작성

### 4. 마케팅 및 SEO (AdSense Approval)
- [x] **SEO 최적화**:
    - [x] `next-sitemap` 도입 및 설정 (Sitemap/Robots.txt 자동 생성)
    - [x] 메타데이터(Title, Description, OpenGraph, Twitter) 강화
- [ ] **콘텐츠 마케팅**:
    - [ ] 블로그/가이드 섹션 구현 (/guides)
    - [ ] 필수 콘텐츠(10개 이상) 및 정적 페이지(Terms, Privacy, About) 보강

---