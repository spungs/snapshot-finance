# Snapshot Finance

**작성일:** 2025-11-25  
**최종 업데이트:** 2026-09-21 (**포트폴리오 전환 캐시 격리 + 변이 후 깜빡임 제거 + 글자 크기 설정** — ① 전환 시 이전 사용자 데이터 잔존: 서버 Redis 는 `holdingsCacheKey(userId)` 로 분리돼 있었지만 브라우저 캐시(SWR localStorage 영속·계좌 필터·홈 시세 stash·일괄등록 최근계좌)는 전부 전역 키였고, 전환이 `router.refresh()` 라 언마운트가 없어 남의 화면에 그대로 남았다 — 스코프가 있던 건 performance-chart 하나뿐. 키마다 ownerId 를 붙이는 대신 `lib/portfolio-scoped-cache.ts` 에 폐기 대상을 모아 전환 시 통째로 버리고 하드 네비게이션한다(전자는 컴포넌트를 새로 만들 때마다 기억해야 해서 누락이 기본값이 된다). `suspendSwrPersist()` 가 없으면 하드 네비게이션의 pagehide 가 메모리에 남은 stale Map 을 다시 저장해 지운 캐시가 되살아난다. 보기 모드는 취향이라 폐기 대상에서 제외. `accounts-client` 는 props 동기화가 아예 없어 계좌 목록이 옛 값에 고정돼 있었다. **후속(같은 날): 전환 진입점이 드롭다운·배너 두 개인데 드롭다운만 고쳐, 배너의 '내 포트폴리오로' 버튼으로 복귀하면 성과 흐름 그래프만 이전 사람 데이터로 남았다** — `router.refresh()` 는 언마운트가 없어 RSC props 는 갱신되지만 SWR 캐시는 남고, 앱에서 `useSWR` 을 쓰는 건 performance-chart 하나뿐이라 정확히 그래프만 티가 났다. 복사 대신 `usePortfolioSwitch()` 훅으로 뽑아 전환 절차를 한 곳에 모음. **스냅샷 목록 카드 클릭 동작 변경**: 행 전체에 걸린 onClick 탓에 카드를 누르면 상세가 아니라 상단 요약만 바뀌며 최상단으로 튀었다 → 카드 정보 영역을 `Link` 로 감싸 상세로 보내고, 요약 전환+스크롤은 좌측 dot(`button`, 탭 영역 44px)이 전담. `Link` 를 액션 행 밖에 두어 링크 중첩과 stopPropagation 의존을 함께 제거. ② 변이 후 깜빡임: `portfolio-client.refresh()` 가 `holdingsApi.getList()` 와 `router.refresh()` 를 둘 다 호출해 같은 데이터를 2회 로드·3회 커밋했고(두 로드의 시점이 달라 숫자가 두 번 튐), AI 챗 경로는 holdings 3회 로드·refresh 2회로 더 심했다. 원인은 props→state 미러링을 못 믿어 쌓인 우회책 — 동기화를 useEffect 에서 렌더 단계로 옮겨 확실하게 만든 뒤 클라이언트 fetch 와 `portfolio:refresh` 이벤트(리스너 1+발행처 2)를 삭제. 삭제에 `useOptimistic` 도입하되 성공 시 base 에서도 직접 제거한다 — `router.refresh()` 는 void 라 await 할 수 없어 transition 이 먼저 끝나면 행이 잠깐 되살아난다. 실시간 tick 은 낙관적 뷰가 아닌 base 를 읽도록 분리(삭제 실패 시 되돌려야 할 행이 tick 으로 굳는 것 방지). 결과: 변이 1회 → 로드 1회 → 커밋 1회. ③ 실질 폰트 28종 난립(임의 px 20종 321회 + Tailwind 8종 335회)에 라이트모드 `--muted-foreground`(362곳)가 페이지 배경 위 4.19:1 로 WCAG AA 미달: `text-[Npx]` 321건을 rem 으로 기계 환산 — 값이 전부 N/16 이라 반올림 없이 떨어지고 스크립트가 `rem × 16 == 원래 px` 로 전건 검산, 기본 루트 16px 에서 픽셀 동일. 컨테이너 폭·차트 높이 px 는 유지(글자만 커지는 게 맞다). 부수 효과로 px/rem 혼재가 해소돼 브라우저 글꼴 설정이 일부 글자에만 먹던 문제도 사라짐. `#6B7684`→`#5F6B7A`(페이지 4.92:1/카드 5.43:1, 다크는 5.33:1 로 이미 통과라 유지), 설정에 글자 크기 보통(16)/크게(18)/아주 크게(20) 추가(`useSyncExternalStore` 라 Provider·effect 없음 + 페인트 전 적용 인라인 스크립트로 FOUC 방지). 직전: **과거 스냅샷 작성 버그 수정 + 스프레드시트 붙여넣기 + 과거 시세 정확도 + 목록 기간검색·다중비교 + 휴장일 자동보정** — 후속으로 ① 2024-03-06 이전 환율 조회 실패(소스 데이터 부재) → ECB frankfurter 폴백 추가, ② 과거 날짜에 당일 종가 대신 최근 시세가 들어가던 문제(붙여넣기가 시트 현재가를 재조회 없이 신뢰 + 국내 종가가 최근 30영업일로 제한) 수정, ③ 잘못 저장된 스냅샷 2건 가격 정정. 원문 — `stocks.market` 은 NASD/NYSE/AMEX 인데 스냅샷 신규·수정 페이지만 `market === 'US'` 로 비교해 항상 false → 미국 종목이 전부 `currency=KRW`/`purchaseRate=1` 로 저장($24.93이 24.93원)되고, 같은 값이 시세 API 로 넘어가 `kis/price` 는 조용히 KOSPI 폴백·`stocks/history` 는 400. 여기에 ① 과거 환율 경로(`stocks/history?market=FX`)가 kis-client 의 US 분기 Yahoo→KIS 교체 후 `KRW=X` 를 못 찾고도 `success:true + data:null` 로 거짓 성공해 모든 과거 스냅샷 환율이 폴백 1435 로 고정, ② 종목별 개별 시세 호출이 `ratelimit.api`(10req/10s)에 걸려 일부만 수신, ③ 가격 빈 행을 저장 시 필터가 말없이 제외 → **16종목 입력이 7종목으로 저장**되는 유실까지 겹쳤다. `toPriceApiMarket`/`detectMarketCurrency` 도입, `getUsdExchangeRateOn(date)` + `/api/exchange-rate?date=` 신설, `/api/stocks/prices/batch`(요청 1건 + 서버 청크 throttle) 추가, 빈 종목은 이름 표시 후 저장 차단·직접 입력 필드 노출. 추가로 스냅샷 작성 화면에 스프레드시트 붙여넣기(헤더 자동 매핑, 투자금액에서 종목별 매입환율 역산, 역산값은 날짜 변경에도 보존)를 넣어 종목 개별 검색 없이 일괄 입력 가능. 직전: **위임 포트폴리오 전환 UX 수정** — ① 프로필 전환 후에도 홈 "성과 흐름" 차트가 이전 사용자 데이터로 남던 버그 수정: SWR 키가 URL 문자열 하나뿐이라 사람별 캐시가 한 칸을 공유했고(localStorage 영속), 전환이 `router.refresh()` 라 차트가 언마운트되지 않아 `revalidateOnMount` 도 재실행되지 않았다 → 키를 `['/api/snapshots/chart-data', portfolioUserId]` 배열로 스코핑하고, SWR v2 가 배열 키를 spread 하지 않고 통째로 넘기는 점에 맞춰 전역 fetcher 가 첫 요소를 URL 로 해석하도록 수정. ② 전환 중 상단 indeterminate 로딩바 추가(헤더 스위처·관리 배너 양쪽). 직전: **위임 포트폴리오 관리 도입** — 내 계정으로 여자친구 포트폴리오를 대리 CRUD. `session.user.id` 단일 스코핑을 `getPortfolioContext()`(actorId=로그인한 나 / portfolioUserId=데이터 대상)로 분리, `PortfolioAccess(owner·grantee·role)` 모델 + `active_portfolio` 쿠키 기반 헤더 프로필 스위처 + 관리 중 배너. 단방향 위임이라 grant 있을 때만 노출(일반 사용자 화면 변화 0), 신원·quota·PRO/역할은 actor 유지. 직전: **홈 "일간 변동" 부호 불일치 수정** — 변동률 ▼ -0.26% 인데 변동금액은 +₩13M 로 부호 반대. 원인은 현재값엔 예수금 포함(`liveSummary.totalValue`)·과거 스냅샷 비교값은 주식 평가금만이라 차액에 예수금이 통째로 섞임. `currentPoint.totalValue` 에서 예수금 차감해 같은 기준으로 정렬. 직전: **일간 스냅샷 중단 복구** — KIS "초당 20건" 한도 초과로 06-08 이후 매일 FAILED 되던 daily-snapshot 을 청크 throttle + 사용자 순차 + EGW00201 재시도로 수정. 직전: **토스증권(TDS) 스타일 UI/UX 전면 리디자인** — 디자인 토큰 전면 교체: 라이트 `#F2F4F6` 그레이 페이지+보더리스 화이트 카드 / 다크 `#17171C`+`#202027`, 토스 블루 `#3182F6`, 상승=빨강·하락=파랑, 라운드 14~18px, 세리프 제거 → Pretendard 단일 타이포. 세그먼트 컨트롤·필터 칩·CTA·다이얼로그 토스화, 에디토리얼 잔재(대문자 트래킹 라벨·액센트 스트라이프·컬러바) 제거. 직전: 종목 수정 인라인 폼 → `EditHoldingDialog` 전환, 티커 변경 지원)  
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
- [x] **위임 포트폴리오 관리 (2026-07-25)**: 내 계정으로 여자친구 포트폴리오를 대리 CRUD. `getPortfolioContext()` 로 actorId(로그인한 나)/portfolioUserId(데이터 대상) 분리, `PortfolioAccess(owner·grantee·role)` 모델 + `active_portfolio` 쿠키 기반 헤더 프로필 스위처 + 관리 배너. 단방향 위임(grant 있을 때만 노출), 신원·quota·PRO/역할은 actor 유지, 관리 모드 회원탈퇴 하드 잠금. 세팅: `scripts/grant-portfolio-access.ts`, 설계: `docs/superpowers/specs/2026-07-25-managed-portfolio-delegation-design.md`
- [x] **위임 포트폴리오 전환 UX 수정 (2026-08-27)**: 프로필 전환 후 홈 "성과 흐름" 차트가 이전 사용자 데이터로 남던 버그 수정 — SWR 캐시 키를 `portfolioUserId` 로 스코핑(`['/api/snapshots/chart-data', portfolioUserId]`) + 전역 fetcher 의 배열 키 지원(SWR v2 는 배열을 spread 하지 않음). 전환 중 상단 로딩바(`PortfolioSwitchProgress`) 추가 — 스위처·관리 배너 공용.

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
- [x] Next.js 16 호환성 업데이트 (`middleware.ts` → `proxy.ts`) *(2025-12-30 다시 `middleware.ts` 로 revert. **2026-05-25 보류 확정** — `proxy.ts` 는 nodejs runtime 고정(edge 미지원)이라 NextAuth v5 의 edge 전제(`auth.config`/`auth.ts` 분리 구조)와 충돌 위험. `/dashboard/*` 인증 보호가 critical 이라 위험 대비 이득(dev deprecation 경고 제거)이 작음. Next 16.0.7 에서 정상 동작·경고만 발생. **재처리 시점: next 메이저 업그레이드 시 NextAuth proxy(nodejs) 호환 검증 + 공식 codemod 와 묶어 별도 브랜치에서 진행.** 단독 작업 불필요)*
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
- [x] **과거 스냅샷 작성 정합성 수정 (2026-09-20)**: 미국주식이 원화로 기록되고 종목이 조용히 누락되던 문제. 근본원인은 `stocks.market` 에 `'US'` 값이 0건(NASD 5489/AMEX 4803/NYSE 2921/KOSPI 2669/KOSDAQ 1846/LSE 3)인데 스냅샷 신규·수정 페이지만 `market === 'US'` 직접 비교를 쓴 것 — 코드베이스의 다른 9곳은 NASD/NYSE/AMEX 를 모두 인식하고 있었다. `lib/utils/market-hours.ts` 에 `toPriceApiMarket()`/`detectMarketCurrency()` 추가해 정규화. 곁들여 ① `getUsdExchangeRateOn(date)`(fawazahmed0 날짜별 API) + `/api/exchange-rate?date=` 로 과거 환율 복구 — 기존 FX 경로는 거짓 성공(`success:true`+`data:null`)이라 늘 폴백 1435 였음(2025-01-31 실제값 1452.64), ② `POST /api/stocks/prices/batch` 로 N종목 가격을 요청 1건에 조회(`ratelimit.api` 10req/10s 공유 버킷 회피 + 서버 내부 KIS 청크 throttle), ③ 값이 빈 종목은 이름을 찍어 저장 차단하고 시세 조회 실패 시 가격 직접 입력 UI 노출. 잘못 저장됐던 2025-01-31 스냅샷은 삭제.
- [x] **국내 과거시세 수정주가 + UAVS 분할 자동보정 + 라벨 정리 (2026-09-20)**: ① `FID_ORG_ADJ_PRC` 가 `1`(원주가)이라 국내 종목의 액면분할 전 주가가 그대로 왔다 — 2011(오입력)·2021 스냅샷에서 삼성전자우가 642,000원(2018-05-16 50:1 분할 전)으로 조회돼 수익률 +1,050%. `0`(수정주가)으로 바꿔 해외(MODP:'1')와 기준 통일. 카카오도 같은 건(5:1). ② `SPLIT_HISTORY` 테이블 도입 — KIS 조정가를 당시 원주가로 되돌린다. UAVS 1:20(2024-02-09)×1:50(2024-10-14) 등록, 조회 날짜보다 나중 분할만 곱해 나누므로 구간별 배수가 다름(÷1000 / ÷50 / 없음). 현재가에는 미적용. ③ **휴장일 보정이 스킵되던 버그** — `markets` 가 비면 판정을 건너뛰는데 날짜를 먼저 고르는 순서에서 항상 비어 있었고 붙여넣기 경로엔 보정 자체가 없었다(2021-10-04 개천절 대체공휴일 사고). 종목 미상 시 `['KR','US']` 기본 + 붙여넣기 후 재판정. ④ 스냅샷 상세의 '현재가' 라벨 → '종가'(과거 기록이라 오해 소지). 보유·시뮬레이션 화면은 실제 현재가라 유지.
- [x] **포트폴리오 전환 캐시 격리 (2026-09-21)**: 브라우저 캐시가 전부 전역 키라 전환 후에도 이전 사용자의 계좌 필터·시세·SWR 응답이 남던 문제. `lib/portfolio-scoped-cache.ts` 로 폐기 대상 키를 단일 출처화하고 전환 시 통째로 폐기 + 하드 네비게이션. `suspendSwrPersist()` 로 pagehide 재저장 차단, 스냅샷 상세는 목록으로 착지(id 가 이전 소유라 404), 전환 거부 시 가드. `accounts-client` 는 props→state 동기화 누락을 렌더 단계 조정으로 수정. 전환 진입점이 드롭다운·배너 2개였는데 배너를 빠뜨려 그래프만 stale 하던 후속 버그는 `usePortfolioSwitch()` 훅으로 통합해 해결.
- [x] **변이 후 깜빡임 제거 (2026-09-21)**: 갱신 장치가 중복 누적돼 변이 1회에 데이터 2~3회 로드·3~5회 커밋하던 문제. props→state 동기화를 렌더 단계로 옮긴 뒤 클라이언트 fetch 와 `portfolio:refresh` 이벤트 우회책을 제거, 삭제에 `useOptimistic` 도입. 변이 1회 → 로드 1회 → 커밋 1회.
- [x] **글자 크기 설정 + 대비 AA 수정 (2026-09-21)**: `text-[Npx]` 321건을 rem 으로 전건 검산 환산(픽셀 동일)해 px/rem 혼재 해소, 라이트모드 보조 텍스트 대비 4.19:1 → 4.92:1, 설정에 글자 크기 3단계 추가.
- [x] **과거 스냅샷 6건 정정 완료 (2026-09-20)**: 2021-09-03(요청 09-05 일요일) / 2021-10-01(요청 10-04 대체공휴일) / 2021-11-01(2011 오입력 정정) / 2021-12-01 / 2021-12-30(요청 2022-01-01 토요일) / 2022-06-03. 전부 이상치 0건. UAVS 시계열 $3.42→3.05→2.94→2.02→1.63→0.81 로 정합. METV 는 KIS 가 주지 않아 사용자 확인값 $14.50 수기 입력.
- [x] **휴장일 선택 시 직전 거래일 자동 보정 (2026-09-20)**: 주말·공휴일·임시 폐장일에 과거 스냅샷을 만들면 그날 종가가 없어 전 종목 조회가 실패하고, 빈 값으로 저장되거나 붙여넣은 시트 값(=오늘 시세)이 그대로 남았다(실제 사고: 2022-01-01 토·신정 스냅샷이 34종목 전부 시트값 → 삼성전자 261,000원, AAPL $336). `GET /api/stocks/trading-day?date=&markets=KR,US` 신설. **공휴일 캘린더는 두지 않는다** — 매년 갱신해야 하고 임시 휴장을 놓친다(2021-12-31 은 미국 개장·한국 폐장). 대표 종목(005930/AAPL)의 시세가 실제로 있는 날을 거래일로 보고, KIS 기간 조회로 14일치를 한 번에 받아 가장 가까운 과거 거래일을 고른다. 양쪽 시장 보유 시 **둘 다 열린 날**을 선택. 신규·수정 화면이 날짜 변경 시 이 API 를 거쳐 보정하고 안내 문구를 띄운다. 조회 실패 시엔 날짜를 건드리지 않는다. 검증: 2022-01-01→2021-12-30, 2021-12-31(KR,US)→2021-12-30 / (US)→그대로, 2026-09-19→2026-09-18.
- [x] **과거 스냅샷 4건 데이터 정정 (2026-09-20)**: 2021-12-01 / 2021-12-30(구 2022-01-01) / 2022-06-03 / 2025-01-31. ① 2022-01-01(토)을 2021-12-30 으로 옮기고 전 종목을 그날 종가로 재조회, ② **분할 보정** — KIS 는 현재 주식 수 기준 조정가를 주므로 해당 날짜 *이후* 분할을 겪은 종목은 평단(원주가)과 기준이 어긋난다. UAVS 1:20(2024-02-09)×1:50(2024-10-14)=**1:1000** → 조정가÷1000, NVDA 10:1(2024-06) → 조정가×10. UAVS 시계열이 $2.02→$1.63→$0.81 로 정합. ③ METV 는 KIS 해외 일별시세가 주지 않아(상장은 유지, 마스터에 AMEX 등록됨) 사용자 확인값 $14.50 수기 입력. 최종 수익률: +0.45% / -0.42% / -30.46% / +27.65%, 분할 이상치 0건. **분할은 자동 보정되지 않으므로** 과거 스냅샷 작성 시 특정 종목 수익률이 튀면 이 경우를 의심할 것 — 상세는 memory `reference_historical_price_pitfalls`.
- [x] **스냅샷 목록 기간검색·다중비교·추이그래프 (2026-09-20)**: 과거 스냅샷 찾기가 어려운 문제. 무한스크롤(IntersectionObserver) 제거 → 기간 범위 필터(전체/1개월/3개월/1년/연도칩/직접지정) + '더 보기' 버튼(cursor 페이징은 유지). 비교 상한 2→10개, 요약/종목 2탭(2개일 땐 기존 SnapshotDiff 를 '상세' 탭으로 유지), 선택 스냅샷 추이 그래프(자산/수익률 토글). **핵심은 기간 필터를 바꿔도 선택이 유지되는 것** — 기존엔 선택 항목을 현재 목록에서 find 해서 필터 변경 시 사라졌다. `GET /api/snapshots?ids=` 를 신설해 목록과 무관하게 holdings 포함 조회하고 `selectedById` 에 캐시한다. `getChartData` 에 id 추가(캐시 키 v2). `snapshots-client`(736줄) 를 넷으로 분해: snapshot-filter-bar / snapshot-trend-chart / selection-tray / snapshot-compare-sheet. 금액 규약(종목 행은 네이티브 통화)은 `types/snapshot.ts` 에 명시. SnapshotBottomPanel 은 CompareSheet 로 대체·제거. 설계: `docs/superpowers/specs/2026-09-20-snapshot-list-compare-design.md`
- [x] **스냅샷 수정 시 USD 이중 환산 수정 (2026-09-20)**: `PUT /api/snapshots/[id]` 가 종목 행의 totalCost/currentValue/profit 을 KRW 로 환산해 저장했는데, POST 와 화면은 **네이티브 통화**를 전제하고 USD 행에 환율을 곱한다 → 수정을 거친 스냅샷의 USD 종목만 금액이 환율배(약 1,400배)로 부풀었다(TSLL 수익 1,831만원 → 275.7억원 표시). PUT 을 POST 규약으로 통일하고, 이미 저장된 44행(2022-06-03·2025-01-31)을 네이티브로 되돌렸다. 정정 후 Σ(종목 totalCost × purchaseRate) 가 스냅샷 본체 totalCost 와 정확히 일치.
- [x] **과거 스냅샷 시세 정확도 수정 (2026-09-20)**: 과거 날짜 스냅샷에 당일 종가가 아니라 최근 시세가 들어가 수익률이 어긋나던 문제. ① 붙여넣기가 시트의 "현재가" 열을 그대로 신뢰하고 재조회를 건너뛰어, 2025-01-31 스냅샷에 TSLL 9.63/SOXL 123.67 같은 최근 값이 박혔다(실제 당일 종가 24.93/26.84) → 값이 있어도 **항상** 스냅샷 날짜로 재조회하고, 실패한 종목만 시트 값을 남기며 `priceFromSheet` 로 "조회 실패, 붙여넣은 값" 표시. ② 국내 종목은 과거 종가 조회가 아예 불가능했다 — `inquire-daily-price`(FHKST01010400)가 최근 30영업일치만 반환(실측: 034220 이 2026-09-15→8610, 2025-01-31→null) → 기간 지정 가능한 `inquire-daily-itemchartprice`(FHKST03010100, 응답 `output2`)로 교체. ③ 환율 소스 `fawazahmed0` 가 2024-03-06 이전 데이터가 없어 그 이전 날짜는 "환율 조회 실패"가 떴다 → ECB 기반 `frankfurter`(1999년~, 키 불필요, 주말은 직전 영업일)를 폴백 체인에 추가. 잘못 저장된 스냅샷 2건은 PUT 으로 가격만 정정(2025-01-31 수익률 54.9%→27.6%, 2022-06-04→06-03 127.6%→-30.3%). **분할 이력 종목(MSTU·UAVS)은 KIS 조정주가와 사용자 평단(원주가)의 기준이 달라 제외** — 상세는 memory `reference_historical_price_pitfalls`.
- [x] **스냅샷 스프레드시트 붙여넣기 (2026-09-20)**: `lib/utils/paste-table.ts` + `components/dashboard/snapshot-paste-dialog.tsx`. 구글시트/엑셀에서 **헤더행을 포함해** 복사하면 열 이름(종목명·종목코드·평균매수단가·보유수량·현재가·투자금액, 영문 별칭 포함)으로 자동 매핑 — 열 순서 무관, 현금·합계행 자동 제외. 종목 해석은 기존 `analyzeBulkImport` 재사용(개별 검색 불필요). **투자금액 ÷ (평단가 × 수량)** 으로 종목별 매입환율을 역산하고(같은 시트에서 1117~1461 로 제각각), `purchaseRateSource: 'manual'` 로 표시해 스냅샷 날짜를 바꿔도 덮어쓰지 않는다.
- [x] **일일 포트폴리오 브리핑 엔드포인트**: `GET /api/portfolio/daily-brief` (Bearer `DAILY_BRIEF_TOKEN` 게이트, `BRIEF_USER_EMAIL` 오너 1인의 보유+등락률+비중+요약 JSON). `holdingService.getList` 재사용 + 캐시에서 `changeRate` 부착 + `weight` 계산. Claude 원격 루틴이 08:00 KST 호출 → 종목별 웹검색 뉴스·리밸런싱 분석 → 텔레그램 전송. 설계: `docs/superpowers/specs/2026-05-30-daily-portfolio-brief-design.md`. **배포·검증 완료**(weight USD→KRW 환산 버그 수정, 비중합 100% 확인). Vercel env(`DAILY_BRIEF_TOKEN`/`BRIEF_USER_EMAIL`) 추가, claude.ai 루틴 `포트폴리오 아침 브리핑`(trig_01J8pdVK64U4uixAbadC5SyS, 화~토 08:00 KST) 등록 완료. *(남은 1건: Default 환경 네트워크 allowlist 에 snapshot-finance.vercel.app·api.telegram.org 추가 — claude.ai UI 작업)*

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
    - [x] **종목 수정 = 다이얼로그 + 티커 변경** (2026-05-31): 인라인 폼을 `EditHoldingDialog`(추가 다이얼로그와 동일한 검색·물타기 UI)로 전환. 종목 검색으로 ticker 자체를 교체 가능(현재가·통화 자동 재조회). 바꾼 종목이 같은 계좌에 이미 있으면 물타기(가중평균)/덮어쓰기로 합치고 수정하던 행은 삭제 — `PATCH /api/holdings/[id]` 가 `stockCode`/`mode` 수용, 단일 트랜잭션 처리. `fetchCurrentPrice`/`detectCurrency` 를 `lib/api/stock-price.ts` 로 공용화(POST/PATCH 공유)
- [x] **스냅샷 기능 보완**: 
    - [x] 스냅샷 목록 '시뮬레이션 실행' 버튼 복구 (데스크톱/모바일 최적화)
    - [x] 스냅샷 비교 화면 레이아웃 수정: 종목명 전체 표시 및 수량 정보 정렬 개선
    - [x] 시뮬레이션 결과 리셋 로직: 스냅샷 옵션 변경 시 이전 결과 즉시 초기화
- [x] **스냅샷 탐색·진입 개선** (2026-05-30):
    - [x] 목록 상단 연/월 기간 필터 — 데이터 있는 달만 노출, 필터 안에서 무한스크롤 유지 / '전체' 복귀 (서버 `getAvailableMonths`, UTC 월 경계)
    - [x] 최상단 큰 카드에 컴팩트 액션 라인 (상세보기 + ⋮ 시뮬레이션) — 풀폭 버튼 대신 절제된 디자인
    - [x] 스냅샷 상세 더보기 메뉴에 시뮬레이션 진입 추가
- [x] **빌드 견고화** (2026-05-30): Upstash env 가 Vercel *Sensitive* 로 전환되며 빌드 시 복호화 안 돼 `new Redis(암호문)` → `UrlError`로 배포 실패. `lib/cache.ts`·`lib/ratelimit.ts` 가 유효 https URL 일 때만 인스턴스화하도록 가드 (런타임 정상, 빌드 크래시 방지)
- [x] **홈 "일간 변동" 부호 불일치 수정** (2026-06-11): 일간/주간 변동 카드에서 변동률은 ▼ -0.26% 인데 변동금액은 +₩13,082,847 로 부호가 반대로 표시. 원인은 `home-client.tsx` 가 `calcChange` 에 넘기는 `currentPoint.totalValue` 로 `liveSummary.totalValue`(주식+**예수금**)를 사용한 반면, 비교 대상인 과거 스냅샷의 `totalValue`(DB `PortfolioSnapshot.totalValue`)는 **주식 평가금만**(예수금은 `cashBalance`/`totalAsset` 별도)이라 기준 불일치 → 변동금액 차액에 예수금이 통째로 섞여 들어감 (변동률은 양쪽 모두 순수 `profitRate` 라 정상). 유틸 주석(`snapshot-comparison.ts`)도 "totalValue 기준: 주식 평가금만(cashBalance 제외)"로 명시 → 호출부 버그. 수정: `currentPoint.totalValue = liveSummary.totalValue - liveSummary.cashBalance` 로 같은 기준 맞춤. 재현 검증(`calcChange` 실측): 예수금 포함 시 -0.26%/+12,822,847원(❌) → 제외 시 -0.26%/-260,000원(✅ 부호 일치)
- [x] **일간 스냅샷 중단 복구** (2026-06-11): 06-08 이후 daily-snapshot 이 매일 FAILED — 원인은 `processUser` 가 한 사용자의 전 종목을 `Promise.all` 로 동시 발사 + 사용자까지 병렬(`USER_BATCH_SIZE=10`) → 수십 건 동시 KIS 호출이 **"초당 20건" 한도(EGW00201)** 초과 → 미국 종목 >50% 실패 → 516b74b 의 abort 로직 발동으로 스냅샷 미생성. 평소엔 Finnhub/Redis 캐시가 미국 종목을 받아내 가려져 있다가 06-08 그 방어선이 뚫리며 표출. 수정: ① 현재가 조회를 청크(8)+1.1s 간격으로 throttle, ② 사용자 순차 처리(`USER_BATCH_SIZE=1`), ③ `kis-client` 국내·해외 현재가에 EGW00201 점증 backoff 재시도 추가. 재현 테스트(Finnhub 차단 후 KIS-only 38건): 수정 전 10/38 실패 → 수정 후 0/38
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
    - [x] **운영 DB 적용 완료** *(2026-05-25 확인 — 운영 Supabase 마이그레이션 적용 + Vercel 배포 동작 중)*
- [x] **계좌 관리 화면**: CRUD + 이름 변경 + 순서 변경 (드래그)
- [x] **계좌 삭제 확인 다이얼로그**:
    - [x] 보유 종목 없음: "[계좌명] 을(를) 삭제하시겠습니까?"
    - [x] 보유 종목 있음: "[계좌명] 에 N 개 종목이 있습니다. 모두 함께 삭제됩니다."
    - [x] **마지막 계좌**: 위 메시지에 더해 "삭제 후 보유 자산이 아무것도 남지 않습니다" 뉘앙스의 추가 경고. 마지막 계좌도 삭제 허용.
- [x] **일괄 등록(Batch Stock Registration) 기능 부활 + 환율 추가** *(다중 계좌 작업 사전 정리 + 일반 사용자 공개)*:
    - [x] 진입점 UI 복구 — 대시보드 또는 포트폴리오 화면에 버튼/다이얼로그 부활 (서버 액션 `app/actions/admin-actions.ts` 그대로 활용)
    - [x] `executeBulkImport` 의 `requireAdmin()` 가드 해제 → 일반 사용자 공개
    - [x] **환율(`purchaseRate`) 입력 추가 — 라인별 방식**:
        - [x] `ImportItem` 타입 확장: `{ identifier, quantity, averagePrice, purchaseRate? }`
        - [x] 파싱 포맷 변경: `"AAPL 5 180.5 1380"` (4번째 토큰 = 환율, 옵셔널)
        - [x] i18n `formatDesc` 갱신: USD 라인에 환율 칸 안내 추가, 누락 시 폴백 정책 명시
        - [x] 폴백 정책: USD 종목인데 환율 미입력 시 → 현재 환율(`exchange-rate` API) 자동 채움 + UI 미리보기에 "자동 채움" 표시
        - [x] `executeBulkImport` 에서 `Holding.purchaseRate` 채워넣기 (현재는 schema 기본값 `1` 로 들어감)
    - [x] 안전장치 — Upstash rate limit 적용, 입력 N 개 상한, 트랜잭션 timeout 검토
    - [x] **계좌 셀렉터** (BrokerageAccount 도입 후) — 모달 상단에 1개 계좌 선택, batch 전체에 적용
    - [x] 같은 계좌 + 같은 종목 충돌 정책 — 단일 폼과 일관 (덮어쓰기 / 가중평균 합치기)
- [x] **종목 추가/수정 폼**: 계좌 셀렉터 추가, "최근 사용 계좌" 기본값. 매입환율(`purchaseRate`) 입력은 USD 종목 한정으로 이미 가능 (`portfolio-client.tsx:671-674`) — 추가 작업 불필요
- [x] **Holdings 화면 보기 토글**: `계좌별` ↔ `통합 합산` (sticky toggle, localStorage 영속)
    - [x] 통합 모드: 같은 stockId 그룹핑 + 가중평균 표시
    - [x] 계좌별 모드: BrokerageAccount 단위로 섹션 분리
- [x] **스냅샷 생성 로직**: 모든 계좌 Holdings 를 stockId 로 group by + 가중평균 계산해 SnapshotHolding 1 행씩 생성 (출력 포맷은 기존과 동일)
- [x] **시세 업데이트**: 같은 stockId 의 모든 Holding row 에 동일 `currentPrice` 반영 (단순 확장)
- [x] **AI 어시스턴트(`/api/ai/portfolio`)**: 계좌 컨텍스트 인지 — 자연어 명령에 계좌명 포함 가능하도록 시스템 프롬프트 + 툴 정의 보강 ("NH 에 삼성전자 추가" 등)
- [x] **이미지 공유**: 통합 뷰 기준으로 캡처 (변경 최소)
- [x] **계좌 소유 검증 (IDOR 방어)** *(보안 critical)*:
    - [x] `accountId` 를 받는 모든 API/Server Action 진입점에서 `BrokerageAccount.userId === session.user.id` 검증
    - [x] 적용 범위: 종목 추가/수정/삭제, 계좌 이름 변경/순서 변경/삭제, 일괄 등록(`executeBulkImport`), AI 어시스턴트(`/api/ai/portfolio`) 의 모든 변이 경로
    - [x] 권장 패턴: Prisma `where` 절에 `userId` 함께 조건 걸어 소유 안 한 계좌는 결과 자체가 0 건이 되도록 처리 (방어 깊이)
    - [x] 회귀 방지: 새 변이 핸들러 추가 시 이 검증을 빠뜨리지 않도록 헬퍼 함수(`assertAccountOwnership(accountId, userId)`) 도입 (`lib/auth-helpers.ts`)
- [x] **시드(`prisma/seed.ts`) 갱신** *(Phase A 완료 — 2026-05-10)*:
    - [x] `BrokerageAccount` 더미 데이터 시드 — freeUser 에 "기본 계좌" / "NH투자증권" / "키움증권" 3 개 추가
    - [x] cleanup 부분에 `brokerageAccount.deleteMany({})` 추가
    - [x] **운영 wipe 안전 가드 추가** — `DATABASE_URL` 이 localhost/127.0.0.1 아니면 abort (조건 없는 deleteMany 가 운영 데이터 삭제 위험성 차단)
    - [x] `npm run seed:dev` 로컬 검증 — 대시보드 동작 확인 완료 (운영 배포로 검증됨)

---

**📋 추가 검토 항목 (사용자 검토 후 진행 — 현재 Critical 만 진행)**

⚠️ 아래 항목들은 plan 에 등재만 해두고 즉시 작업하지 않음. Critical 작업 완료 후 사용자가 우선순위 결정 → 개별 작업 시작.

**Important (놓치면 UX/일관성 문제):**
- [ ] **빈 상태(Empty State) UX**: 신규 가입자 자동 "기본 계좌" 생성 트리거 위치 결정 (회원가입 시 vs 첫 종목 추가 시) + 마지막 계좌 삭제 직후 종목 추가 시 동작 정의 (자동 재생성 vs 계좌 먼저 만들도록 강제)
- [x] **단일 계좌 사용자 UX 단순화**: 계좌 1 개만 있을 때 종목 폼의 계좌 셀렉터 자동 숨김 / 보기 토글 비활성화 처리 — 기존 사용자가 마이그레이션 후 UI 변화 거의 못 느끼게
- [x] **주식이체(Transfer Between Accounts) 기능** — *구현 완료 (커밋 `616f5c3`): 부분/전체 이체, 충돌 시 가중평균 merge, USD 매입환율 보존, IDOR 검증*
  - **부분 이체 지원**: 전체 또는 일부 수량 (수량 input, 보유 수량 이하 검증)
  - **충돌 시 자동 가중평균 merge**: 목적지에 동일 종목 있으면 수량 합산 + 평단가 가중평균. USD 종목은 매입환율도 가중평균. 실제 증권사 동작과 일치
  - **매입환율 보존(USD)**: 이체 시 원본 row 의 `purchaseRate` 유지 — 새 평가/손익 왜곡 방지
  - **UI 진입점**: 종목 카드 `⋮` 메뉴 → "다른 계좌로 이체" → 이체 다이얼로그 (대상 계좌 select + 수량 input). 계좌 1개일 때 메뉴 항목 숨김
  - **서버**: Server Action `transferHolding(holdingId, toAccountId, quantity)` 단일 트랜잭션 — 원본 차감(0 되면 삭제) + 대상 upsert(merge or create), IDOR 검증(`assertHoldingOwnership` + `assertAccountOwnership`)
  - **스냅샷 영향 없음**: 과거 스냅샷 불변, 다음 스냅샷부터 새 계좌 위치 반영
  - **이체 로그**: Phase 1 에서는 별도 audit 테이블 만들지 않음 — Holding 수정 자체로 충분. 추후 필요 시 도입
- [x] **다국어(i18n) 적용**: 신규 UI 텍스트 ko/en 번역 (계좌 관리 화면, 셀렉터, 다이얼로그, 빈 상태 메시지). "기본 계좌" / "Default Account" 등 시스템 생성 라벨 처리
- [x] **캐시 무효화 (L1/L2)**: Upstash Redis + localStorage SWR 캐시 — 계좌/종목 CRUD 시 `accountService.invalidate` 트리거 (account-actions / holding-actions / holdings route 전반)
- [x] **API 응답 스키마 확장**: 계좌 정보(`accountId`/`accountName`)는 `/api/holdings` 응답 확장 대신 `portfolio/page.tsx` 에서 `brokerageAccount` 를 직접 주입하는 방식으로 제공 (계좌별 모드 렌더링)

**Minor (놓치면 안 되는 디테일):**
- [x] **모바일 진입점**: `MobileNav` 에 `/dashboard/accounts` 항목 추가로 결정 (`mobile-nav.tsx`)
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

**✅ 배포 완료 (2026-05-25 확인):** Phase B 코드 + 운영 DB 마이그레이션(`20260510134043_add_brokerage_account`)이 모두 적용되어 운영(Supabase + Vercel)에서 정상 동작 중. 아래 절차는 이력 보존용.

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