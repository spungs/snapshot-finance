# Snapshot Finance

**작성일:** 2025-11-25  
**최종 업데이트:** 2026-05-12 (계좌별 예수금 입력 풀스택 통합 — User/PortfolioSnapshot.cashAccounts JSON 컬럼 + CashAccountEditor + BrokerageAccount 라벨 자동 시드 + 스냅샷 동결 + AI 다중 계좌 안전장치. legacy `예수금` 라벨 → 첫 BrokerageAccount 이름 이관 마이그레이션 로컬/Supabase 양쪽 적용 완료)  
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
- [x] **사용자 프로필 드롭다운 메뉴**: 자동 스냅샷 설정 토글, 로그아웃, 탈퇴 기능 통합

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
- [x] Next.js 16 호환성 업데이트 (`middleware.ts` → `proxy.ts`) *(2025-12-30 다시 `middleware.ts` 로 revert — Next.js 16 dev 시 deprecation 경고만, 작동 영향 없음. Next.js 17 시점에 재처리)*
- [x] Vercel 배포 환경 이슈 해결 (DB 연결, 시간대, 환경변수)
- [x] **Cron 표준화**: Supabase pg_cron 으로 통합 (`vercel.json` 제거) — daily-snapshot, update-prices-kr/us 가격 워밍 *(M7 뉴스 7개 cron은 2026-05-07 뉴스 기능 제거와 함께 일괄 unschedule)*
- [x] **미국주식 가격 공유 캐시**: `/api/cron/update-prices?market=US` cron 추가 + KIS 해외시세 폴백(EXCD 자동 매핑)
- [x] **Snapshot 로직 고도화**: 단순 복사 -> **매일 실시간 시세 조회(Fetch)** 방식으로 업그레이드
- [x] **스케줄링**: 월~금(UTC) 스냅샷 생성 / 매일 유저 정리 자동화
- [x] **Weekly Snapshot 최적화**: 금요일 22:30 UTC (토요일 07:30 KST) 실행 및 중복 방지 로직 추가
- [x] 구글 애드센스 검증 파일 추가 (`ads.txt`)
- [x] 스냅샷 목록 버그 수정 (사용자 ID 연동)
- [x] [Bug] Korean Search: Korean stock names not found (Result: "Invalid Search Query") -> Fixed with full KIS master seed and improved fallback
- [x] [UX] Delete Holding: Disable row and show loading state during deletion)
- [x] [Fix] Build Error: Fix type mismatch in i18n context (`t` function)
- [x] [Fix] KIS API Token 자동 갱신: 토큰 만료 시 자동으로 재발급 및 재시도 로직 구현
- [x] [Docs] 가이드 콘텐츠 수정: 수익률 표 순수익 기준 변경 및 양도소득세 공제 내용 추가
- [x] [Docs] README.md 업데이트: 프로젝트 개요, 기술 스택, 주요 기능 및 아키텍처 정리

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
        - [x] **계좌별 예수금 입력 (2026-05-12)**:
            - [x] `User.cashAccounts` / `PortfolioSnapshot.cashAccounts` JSON 컬럼 추가 (합계는 `cashBalance` 캐시로 유지 → 차트/스냅샷/AI 등 기존 코드 무변경)
            - [x] `types/cash.ts`(CashAccount) + `validateCashAccounts` (≤20개, 라벨 ≤50자, 빈 라벨은 "예수금" 폴백, 합계 ≤10조 한도)
            - [x] 신규 `updateCashAccounts(rows)` server action + 기존 `updateCashBalance(amount)` 에 B안(다중 계좌 분리 시 거부, code: MULTIPLE_ACCOUNTS) 적용
            - [x] **CashAccountEditor** 공통 컴포넌트 — 라벨+금액 행 추가/삭제/실시간 합계. 다이얼로그·스냅샷 생성·스냅샷 편집 폼 3곳에서 재사용
            - [x] **BrokerageAccount 자동 시드** — 다이얼로그 진입 시 사용자의 증권 계좌 이름이 빈 금액 행으로 자동 등장, 기존 cashAccount 라벨 매칭 시 금액 자동 채움, 매칭 안 되는 항목(legacy "예수금" 등)은 orphan 행으로 보존
            - [x] **AI 챗 안전장치** — 다중 계좌 분리 상태에서 자연어로 합계 단일 수정 시 거부하고 다이얼로그 안내 토스트
            - [x] **스냅샷 동결** — 일간 cron `daily-snapshot` 이 `user.cashAccounts` 도 함께 저장, snapshot POST/PUT API 가 cashAccounts 입력 수용 (합계는 서버에서 sum 으로 검증/계산), 상세 페이지에 계좌별 분해 라벨/금액 표시 (legacy 스냅샷은 합계만 표시 폴백)
            - [x] FormattedNumberInput 정렬 버그 수정 — 라벨 없는 케이스에서 `₩` prefix 가 패딩 때문에 input 텍스트와 어긋나던 문제 해결
            - [x] 마이그레이션 2 종 (로컬/Supabase 양쪽 적용):
                - `20260512000000_add_cash_accounts` — 컬럼 추가 + 기존 `cashBalance > 0` 사용자를 `[{label:"예수금", amount:<기존값>}]` 1행으로 백필
                - `20260512000001_migrate_legacy_cash_label` — legacy `예수금` 라벨을 사용자의 첫 BrokerageAccount (`displayOrder` + `createdAt` 순) 이름으로 이관, 동명 라벨이 이미 있으면 amount 합산해 단일 행으로 통합 (멱등성 보장)
    - [x] **모바일 반응형 레이아웃 디테일 수정**: 
        - [x] 모바일용 카드 뷰(Card View) 구현 완료 (보유 종목, 스냅샷 목록)
        - [x] 대시보드 헤더 및 포트폴리오 요약 카드 모바일 최적화
        - [x] 모바일 목표 자산 설정 UI 개선 (레이아웃 틀어짐 수정)
        - [x] 모바일 포트폴리오 비교 섹션 스타일 수정 (동일 포트폴리오 시 레이아웃 깨짐)
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
- [x] **종목 일괄 등록(Batch Stock Registration) 기능 공개 전환**: *(2026-05-10 검증: 이후 코드 정리에서 UI 진입점이 누락된 것으로 확인 — 서버 액션(`app/actions/admin-actions.ts: executeBulkImport / analyzeBulkImport`)과 i18n 키(`portfolioManage`)만 남아있고 호출 컴포넌트 없음. 5번 섹션 "일괄 등록 기능 부활 + 환율 추가" 작업으로 재공개 예정)*
    - [x] '시크릿 어드민 모드'를 공개 기능으로 전환 및 버튼 추가
    - [x] UI/UX 개선: 예수금 현재 잔액 표시 및 즉시 갱신
    - [x] 접근성 개선: 로고 링크 복구 및 모바일 네비게이션 연동
    - [x] 다국어 심화 적용: '다시 쓰기', '원본 데이터 수정' 등 세부 버튼 번역 완료
- [x] **모바일 UX 고도화**:
    - [x] 당겨서 새로고침(Pull-to-Refresh) 구현: 모바일 웹에서의 새로고침 편의성 증대 (`PullToRefresh.tsx`)
    - [x] 오버스크롤 방지: Native Pull-to-Refresh와 커스텀 로직 충돌 방지 (`overscroll-behavior-y: none`)
    - [x] 다국어 누락 수정: 'Qty', 'Price' 라벨 번역 적용
    - [x] **모바일 종목 수정 UI 구현**: 모바일 카드 뷰에서 인라인 수정 기능 추가 및 버튼 가시성 버그 해결
- [x] **스냅샷 기능 보완**: 
    - [x] 스냅샷 목록 '시뮬레이션 실행' 버튼 복구 (데스크톱/모바일 최적화)
    - [x] 스냅샷 비교 화면 레이아웃 수정: 종목명 전체 표시 및 수량 정보 정렬 개선
    - [x] 시뮬레이션 결과 리셋 로직: 스냅샷 옵션 변경 시 이전 결과 즉시 초기화
- [x] **포트폴리오 이미지 공유**: 
    - [x] 보유 페이지에 공유 버튼 추가 — 현재 보유 종목을 PNG 이미지로 캡처
    - [x] 모바일: `navigator.share()`로 카톡/메시지 OS 공유 시트 호출 / 데스크톱: PNG 다운로드 폴백
    - [x] 캡처용 별도 컨테이너로 인터랙션 요소(드롭다운/FAB) 제외, 사용자명·날짜·워터마크·환율 표기 포함
    - [x] 표시 통화(KRW/USD) 및 다국어(ko/en) 자동 적용

### 3. 안정성 및 테스트
- [x] **API 호출 최적화**: 로고 클릭 시 대시보드 새로고침(Link) 차단하여 불필요한 API 비용(KIS) 절감 (PC/Mobile)
- [x] **인증 UX 개선**: Google 로그인 시 계정 선택 및 재로그인 강제 (`prompt: login select_account`)
- [x] **로그아웃 안정성**: 세션 쿠키가 삭제되지 않는 문제(Zombie Session) 해결 (서버 액션에서 강제 삭제)
- [x] **포트폴리오 비교 개선**:
    - [x] 스냅샷 목록 'Clear'(해제) 버튼 추가 및 선택 로직 개선
    - [x] 비교 화면 종목명 표시 형식 변경: '종목명 (티커)'
- [x] **시뮬레이션 결과 개선**:
    - [x] 결과 테이블 '비중'(Weight) 컬럼 추가 (소수점 1자리)
    - [x] 비중 계산 로직 수정 (단일 통화 기준 통일)
- [x] **PWA 도입 (2026-05-07)**:
    - [x] Serwist 기반 Service Worker (NetworkFirst navigation, defaultCache 표준화)
    - [x] iOS apple-touch-startup-image 40종 + standalone manifest
    - [x] 수동 SW 등록 (Next.js 16 호환) + localStorage 영속화 강화
- [x] **캐싱 다층화 (2026-05-07)**:
    - [x] Upstash Redis 공유 캐시 (L2: holdings/charts/prices/exchange-rate)
    - [x] SWR + localStorage 클라이언트 영속 캐시 (L1)
    - [x] Next.js `staleTimes` 로 navigation 즉시화
    - [x] `cron/update-prices` (KR/US) 가격 워밍 + 장 시간 게이팅 + `force=1` 수동 실행
- [x] **안티패턴 정리 (2026-05-07)**:
    - [x] `useState(prop)` 미동기화 패턴 수정 (portfolio, snapshots, hasMore)
    - [x] 변이 라우트(rate limit / limit 캡 / Promise.allSettled 로깅) 보강
    - [x] `as any` 다수 정리 + i18n `TranslationKey` 타입 export
    - [x] 환율 폴백 매직넘버 산재 → `FALLBACK_USD_RATE` 단일 출처화
    - [x] Decimal/Prisma 타입 정합성(simulation route) 정리
- [ ] **에러 핸들링 강화**: 사용자 친화적인 에러 메시지 및 토스트 알림
- [ ] **단위/통합 테스트**: 주요 비즈니스 로직(수익률 계산 등) 테스트 코드 작성

### 4. 마케팅 및 SEO (AdSense Approval)
- [x] **SEO 최적화**:
    - [x] `next-sitemap` 도입 및 설정 (Sitemap/Robots.txt 자동 생성)
    - [x] 메타데이터(Title, Description, OpenGraph, Twitter) 강화
- [ ] **콘텐츠 마케팅**:
    - [x] 블로그/가이드 섹션 구현 (/guides)
    - [x] 필수 콘텐츠(10개 이상) 및 정적 페이지(Terms, Privacy, About) 보강
    - [x] 가이드 상세 페이지 투자 유의사항(Investment Disclaimer) 추가 및 다국어 지원
    - [x] 전역 헤더(`SiteHeader`) 및 푸터(`SiteFooter`) 컴포넌트화 및 적용
    - [x] ~~**M7 News (구 Big Tech News) 고도화**~~ *(2026-05-07 자산관리 앱 핵심 가치와 어긋나 기능 전면 제거)*
        - ~~UI/UX 리파인: 카드 스타일, 로딩 상태, 폰트 크기 조절 기능(LocalStorage 연동)~~
        - ~~**Navigation 개선**: 로그인 여부에 따른 메뉴 순서 변경(Context-Aware Header) 및 `MainNav` 통합~~
        - ~~브랜딩 변경: 'Big Tech' -> 'M7' 용어 일괄 변경 및 다국어 지원 완벽 적용~~

### 5. 다중 계좌 관리 (Multi-Account Holdings)

**배경 / 페인포인트:**
사용자가 여러 증권 계좌(NH·키움 등)에서 동일 종목을 보유 중일 때, 종목 추가 시 가중평균을 손으로 계산해 한 줄로 입력해야 하는 번거로움 해결.

**핵심 결정:**
- **모델명**: `BrokerageAccount` (NextAuth 의 `Account` 모델과 충돌 회피, UI 에는 "계좌"로 표기)
- **사용자 라벨링 전용**: `name` + `displayOrder` 만 보유. 실제 계좌번호·증권사명·API 타입 같은 무거운 필드 도입하지 않음
- **스냅샷은 통합 유지**: `SnapshotHolding` 에 계좌 정보 포함하지 않음 → 과거 데이터 호환 + 모델 가벼움 유지
- **시뮬레이션은 통합만**: 변경 없음
- **계좌 삭제**: cascade 물리삭제. 마지막 계좌도 삭제 허용. 다이얼로그로 보유 자산 유무 / 마지막 계좌 여부에 따라 메시지 분기
- **일괄 등록 환율 입력 방식**: 라인별 입력 — 종목마다 매입 환율이 다를 수 있어 종목별 정확성 우선. 형식: `[종목] [수량] [평단가] [환율?]` (환율은 옵셔널, USD 종목 누락 시 폴백 처리)

**데이터 모델:**

```prisma
model BrokerageAccount {
  id           String    @id @default(cuid())
  userId       String                              // User 와 연결 (필수)
  name         String                              // 사용자가 rename
  displayOrder Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  holdings     Holding[]

  @@index([userId])
  @@map("brokerage_accounts")
}

// Holding 모델 변경
model Holding {
  // ... 기존 필드 유지
  accountId    String                                                   // 신규
  account      BrokerageAccount  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, stockId])                                        // 변경 (이전: [userId, stockId])
  @@index([accountId])                                                  // 신규
}
```

**작업 항목:**
- [x] **스키마 변경 + 마이그레이션** *(Phase A 완료 — 2026-05-10, dev DB)*:
    - [x] `BrokerageAccount` 모델 추가, `Holding.accountId` FK 추가
    - [x] `@@unique([userId, stockId])` → `@@unique([accountId, stockId])` 교체
    - [x] 마이그레이션 파일 생성 (`20260510134043_add_brokerage_account`) — `prisma migrate diff` 로 SQL 추출 후 데이터 이관 SQL 직접 추가 (멱등성 확보)
    - [x] **데이터 마이그레이션**: 사용자별 "기본 계좌" 자동 생성 (3 명 → 3 계좌) + Holdings 34 건 전부 이관 (NULL 0 건, 비파괴적)
    - [x] dev DB 운영 schema/data 동기화 완료 (`prod_dump_20260510_223450.sql`) — 운영 거울 상태에서 검증
    - [ ] **운영 DB 적용 — Phase B 완료 후 별도 절차** (백업 후 같은 마이그레이션 SQL 실행)
- [ ] **계좌 관리 화면**: CRUD + 이름 변경 + 순서 변경 (드래그)
- [ ] **계좌 삭제 확인 다이얼로그**:
    - [ ] 보유 종목 없음: "[계좌명] 을(를) 삭제하시겠습니까?"
    - [ ] 보유 종목 있음: "[계좌명] 에 N 개 종목이 있습니다. 모두 함께 삭제됩니다."
    - [ ] **마지막 계좌**: 위 메시지에 더해 "삭제 후 보유 자산이 아무것도 남지 않습니다" 뉘앙스의 추가 경고. 마지막 계좌도 삭제 허용.
- [ ] **일괄 등록(Batch Stock Registration) 기능 부활 + 환율 추가** *(다중 계좌 작업 사전 정리 + 일반 사용자 공개)*:
    - [ ] 진입점 UI 복구 — 대시보드 또는 포트폴리오 화면에 버튼/다이얼로그 부활 (서버 액션 `app/actions/admin-actions.ts` 그대로 활용)
    - [ ] `executeBulkImport` 의 `requireAdmin()` 가드 해제 → 일반 사용자 공개
    - [ ] **환율(`purchaseRate`) 입력 추가 — 라인별 방식**:
        - [ ] `ImportItem` 타입 확장: `{ identifier, quantity, averagePrice, purchaseRate? }`
        - [ ] 파싱 포맷 변경: `"AAPL 5 180.5 1380"` (4번째 토큰 = 환율, 옵셔널)
        - [ ] i18n `formatDesc` 갱신: USD 라인에 환율 칸 안내 추가, 누락 시 폴백 정책 명시
        - [ ] 폴백 정책: USD 종목인데 환율 미입력 시 → 현재 환율(`exchange-rate` API) 자동 채움 + UI 미리보기에 "자동 채움" 표시
        - [ ] `executeBulkImport` 에서 `Holding.purchaseRate` 채워넣기 (현재는 schema 기본값 `1` 로 들어감)
    - [ ] 안전장치 — Upstash rate limit 적용, 입력 N 개 상한, 트랜잭션 timeout 검토
    - [ ] **계좌 셀렉터** (BrokerageAccount 도입 후) — 모달 상단에 1개 계좌 선택, batch 전체에 적용
    - [ ] 같은 계좌 + 같은 종목 충돌 정책 — 단일 폼과 일관 (덮어쓰기 / 가중평균 합치기)
- [ ] **종목 추가/수정 폼**: 계좌 셀렉터 추가, "최근 사용 계좌" 기본값. 매입환율(`purchaseRate`) 입력은 USD 종목 한정으로 이미 가능 (`portfolio-client.tsx:671-674`) — 추가 작업 불필요
- [ ] **Holdings 화면 보기 토글**: `계좌별` ↔ `통합 합산` (sticky toggle, localStorage 영속)
    - [ ] 통합 모드: 같은 stockId 그룹핑 + 가중평균 표시
    - [ ] 계좌별 모드: BrokerageAccount 단위로 섹션 분리
- [ ] **스냅샷 생성 로직**: 모든 계좌 Holdings 를 stockId 로 group by + 가중평균 계산해 SnapshotHolding 1 행씩 생성 (출력 포맷은 기존과 동일)
- [ ] **시세 업데이트**: 같은 stockId 의 모든 Holding row 에 동일 `currentPrice` 반영 (단순 확장)
- [ ] **AI 어시스턴트(`/api/ai/portfolio`)**: 계좌 컨텍스트 인지 — 자연어 명령에 계좌명 포함 가능하도록 시스템 프롬프트 + 툴 정의 보강 ("NH 에 삼성전자 추가" 등)
- [ ] **이미지 공유**: 통합 뷰 기준으로 캡처 (변경 최소)
- [ ] **계좌 소유 검증 (IDOR 방어)** *(보안 critical)*:
    - [ ] `accountId` 를 받는 모든 API/Server Action 진입점에서 `BrokerageAccount.userId === session.user.id` 검증
    - [ ] 적용 범위: 종목 추가/수정/삭제, 계좌 이름 변경/순서 변경/삭제, 일괄 등록(`executeBulkImport`), AI 어시스턴트(`/api/ai/portfolio`) 의 모든 변이 경로
    - [ ] 권장 패턴: Prisma `where` 절에 `userId` 함께 조건 걸어 소유 안 한 계좌는 결과 자체가 0 건이 되도록 처리 (방어 깊이)
    - [ ] 회귀 방지: 새 변이 핸들러 추가 시 이 검증을 빠뜨리지 않도록 헬퍼 함수(`assertAccountOwnership(accountId, userId)`) 도입 검토
- [x] **시드(`prisma/seed.ts`) 갱신** *(Phase A 완료 — 2026-05-10)*:
    - [x] `BrokerageAccount` 더미 데이터 시드 — freeUser 에 "기본 계좌" / "NH투자증권" / "키움증권" 3 개 추가
    - [x] cleanup 부분에 `brokerageAccount.deleteMany({})` 추가
    - [x] **운영 wipe 안전 가드 추가** — `DATABASE_URL` 이 localhost/127.0.0.1 아니면 abort (조건 없는 deleteMany 가 운영 데이터 삭제 위험성 차단)
    - [ ] `npm run seed:dev` 로컬 검증 — Phase B 완료 후 대시보드 동작 확인

---

**📋 추가 검토 항목 (사용자 검토 후 진행 — 현재 Critical 만 진행)**

⚠️ 아래 항목들은 plan 에 등재만 해두고 즉시 작업하지 않음. Critical 작업 완료 후 사용자가 우선순위 결정 → 개별 작업 시작.

**Important (놓치면 UX/일관성 문제):**
- [ ] **빈 상태(Empty State) UX**: 신규 가입자 자동 "기본 계좌" 생성 트리거 위치 결정 (회원가입 시 vs 첫 종목 추가 시) + 마지막 계좌 삭제 직후 종목 추가 시 동작 정의 (자동 재생성 vs 계좌 먼저 만들도록 강제)
- [ ] **단일 계좌 사용자 UX 단순화**: 계좌 1 개만 있을 때 종목 폼의 계좌 셀렉터 자동 숨김 / 보기 토글 비활성화 처리 — 기존 사용자가 마이그레이션 후 UI 변화 거의 못 느끼게
- [ ] **주식이체(Transfer Between Accounts) 기능** — *2026-05-12 사양 확정, 운영 smoke test 완료 후 착수*
  - **부분 이체 지원**: 전체 또는 일부 수량 (수량 input, 보유 수량 이하 검증)
  - **충돌 시 자동 가중평균 merge**: 목적지에 동일 종목 있으면 수량 합산 + 평단가 가중평균. USD 종목은 매입환율도 가중평균. 실제 증권사 동작과 일치
  - **매입환율 보존(USD)**: 이체 시 원본 row 의 `purchaseRate` 유지 — 새 평가/손익 왜곡 방지
  - **UI 진입점**: 종목 카드 `⋮` 메뉴 → "다른 계좌로 이체" → 이체 다이얼로그 (대상 계좌 select + 수량 input). 계좌 1개일 때 메뉴 항목 숨김
  - **서버**: Server Action `transferHolding(holdingId, toAccountId, quantity)` 단일 트랜잭션 — 원본 차감(0 되면 삭제) + 대상 upsert(merge or create), IDOR 검증(`assertHoldingOwnership` + `assertAccountOwnership`)
  - **스냅샷 영향 없음**: 과거 스냅샷 불변, 다음 스냅샷부터 새 계좌 위치 반영
  - **이체 로그**: Phase 1 에서는 별도 audit 테이블 만들지 않음 — Holding 수정 자체로 충분. 추후 필요 시 도입
- [ ] **다국어(i18n) 적용**: 모든 신규 UI 텍스트 ko/en 번역 (계좌 관리 화면, 셀렉터, 다이얼로그, 빈 상태 메시지). "기본 계좌" / "Default Account" 등 시스템 생성 라벨 처리
- [ ] **캐시 무효화 (L1/L2)**: Upstash Redis (`holdings`/`portfolio` 키) + localStorage SWR 캐시 — 계좌 CRUD 시 무효화 트리거. 캐시 키 구조에 `accountId` 차원 포함 여부 결정
- [ ] **API 응답 스키마 확장**: `/api/holdings` 응답에 `accountId`/`accountName` 포함 (계좌별 모드 렌더링용). 기존 클라이언트는 새 필드 무시하므로 호환성 OK

**Minor (놓치면 안 되는 디테일):**
- [ ] **모바일 진입점**: 계좌 관리 페이지를 어디서 열지 — `/dashboard/settings` 하위 vs `MobileNav` 항목 추가
- [ ] **운영 DB 백업 권고**: 데이터 마이그레이션 직전 Supabase 백업 스냅샷 생성 (`migrate deploy` 운영 적용 절차에 포함)
- [ ] **모바일 카드 뷰 영향**: "계좌별" 모드일 때 카드 뷰에서 계좌 헤더 표시 방식 정의 (sticky 헤더 vs 단순 라벨)

---

**참고 — 과거 `SecuritiesAccount` 제거 이력 검토:**
- 커밋 `78b000a` (2025-12-11) "Refactor: Remove SecuritiesAccount and Simulation tables" 에서 제거
- 당시 모델은 `accountNumber` / `brokerName` / `apiType` / `isActive` / `isAutoSnapshotEnabled` 등 **증권사 API 연동을 전제한 무거운 구조** 였음
- 본 안의 `BrokerageAccount` 는 **사용자 라벨링 전용**으로 가벼운 형태 → 같은 함정 회피
- `User.isAutoSnapshotEnabled` 는 사용자 단위 그대로 유지 (계좌 단위 아님)

**참고 — 환율(purchaseRate) 처리 현재 상태 (2026-05-10 검증):**
- **단일 종목 추가/수정 폼**: USD 종목 한정으로 매입환율 입력 이미 가능 (`portfolio-client.tsx:671-674`). KRW 종목은 환율 무의미 → 입력란 미노출. 다중 계좌 작업에서 환율 추가 작업 불필요.
- **일괄 등록 기능**: 서버 액션(`executeBulkImport / analyzeBulkImport`)과 i18n(`portfolioManage` 네임스페이스)은 살아있으나, 호출 UI 컴포넌트 없음 → 현재 미동작. `ImportItem` 타입과 `executeBulkImport` 모두 `purchaseRate` 미처리 → USD 종목 등록 시 schema 기본값 `1` 로 들어가 평가손익 왜곡 위험. 부활 시 환율 처리 추가 필수.

**⚠️ 배포 금지 구간 (Phase A 완료 ~ 운영 DB 마이그레이션 적용 전):**
현재 `prisma/schema.prisma` 와 운영 DB schema 가 어긋난 상태 (BrokerageAccount / Holding.accountId 미적용). Vercel 배포 시 prisma client 가 운영 DB 에 없는 테이블/컬럼 쿼리하여 런타임 에러 발생. **Phase B 코드 작업 + 운영 DB 마이그레이션 적용 모두 끝난 후에만 배포 가능.**

**운영 DB 마이그레이션 적용 정확한 절차:**
1. **운영 DB 백업 (필수)** — `pg_dump "$PROD_DIRECT_URL" --schema=public --no-owner --no-acl > prod_dump_pre_brokerage_<ts>.sql`
2. **마이그레이션 적용** (두 옵션 중 택 1):
   - **옵션 A — `prisma migrate deploy` (권장)**: `package.json` 에 `"migrate:prod": "prisma migrate deploy"` 추가 후 `npm run migrate:prod`. `_prisma_migrations` row 자동 추가, transaction-safe.
   - **옵션 B — 수동 SQL**: `psql "$PROD_DIRECT_URL" -v ON_ERROR_STOP=1 -1 < prisma/migrations/20260510134043_add_brokerage_account/migration.sql` + `prisma migrate resolve --applied 20260510134043_add_brokerage_account` 별도 실행.
3. **검증** — 운영 `brokerage_accounts` row 수 ≥ 사용자 수, `holdings.accountId` NULL 0 건 확인.
4. **schema.prisma + 코드 배포** — Vercel 자동 배포로 반영.

**백업 파일 보관 정책:**
- `prod_dump_*.sql`, `dev_backup_*.sql` 은 사용자 이메일/토큰 등 비밀 데이터 포함. macOS Time Machine 자동 백업 시스템에 노출 가능.
- `.gitignore` 등재로 git commit 노출은 차단됨.
- 작업 종료 시 secure delete (`rm -P prod_dump_*.sql dev_backup_*.sql`) 또는 암호화 디스크 (FileVault Vault, encrypted DMG) 이동 권장.
- 운영 적용 후 `prod_dump_pre_brokerage_<ts>.sql` 만 롤백용으로 30 일 단기 보관 후 삭제.

---