# 포트폴리오 추이 비교 (나 vs 관리 중인 포트폴리오) — 설계

- 최종 업데이트: 2026-10-18
- 상태: 구현 완료 (2026-10-18)
- 관련: `lib/portfolio-context.ts`, `lib/services/snapshot-service.ts`, `app/dashboard/more/page.tsx`,
  `components/dashboard/performance-chart.tsx`
- 선행: [위임 포트폴리오 관리](./2026-07-25-managed-portfolio-delegation-design.md)

## 1. 목표

내 자산 추이와 여자친구(위임으로 관리 중인 owner) 자산 추이를 **한 화면의 한 차트에 겹쳐서** 비교한다.

## 2. 확정된 결정

1. 비교 지표는 **수익률(%) / 총자산(원) 토글** — 기존 홈 '성과 흐름' 차트와 같은 두 모드. 기본 = 수익률.
2. 데이터 접근은 **서버 페이지에서 직접 조회(A안)** — 새 API 없음.
3. 볼 수 있는 사람 = **위임 grant 를 받은 grantee(나)** 뿐. grant 가 단방향이므로 여자친구 계정에는 진입점이 없다.
4. 진입점 = '더보기'의 새 그룹 '함께 보기' → "추이 비교" 항목. **grant 가 있을 때만** 그룹째 노출.
   (기존 '도구' 그룹의 실제 라벨이 '시뮬레이션'이라 거기 넣으면 의미가 어긋남 — 시뮬레이션 그룹 다음에 배치)

## 3. 비목표 (YAGNI)

- 여자친구 쪽에서 내 추이 보기(양방향) 없음
- 기간 시작점을 0% 로 맞춘 "기간 수익률(rebase)" 없음 — 스냅샷 `profitRate` 그대로
- 종목/계좌 단위 비교 없음
- 새 API·스키마 변경·마이그레이션 없음

## 4. 접근 제어 (핵심)

지금 앱은 요청당 한 사람(`portfolioUserId`)만 읽는다. 이 화면은 **두 사람 데이터를 동시에 읽는 첫 경로**이므로
대상 목록을 클라이언트 입력(쿠키/쿼리)에서 받지 않고 **서버가 grant 로만 결정**한다.

```
ctx = getPortfolioContext()            // null → redirect('/auth/signin')
managed = listManagedPortfolios(ctx.actorId)   // grantee=나 인 grant 행만
managed.length === 0 → redirect('/dashboard/more')
series = [ { userId: ctx.actorId, label: '나' }, ...managed.map(m => ({ userId: m.ownerId, label: m.name })) ]
```

- `ctx.portfolioUserId` / `active_portfolio` 쿠키는 **사용하지 않는다** → 지금 여자친구 포트폴리오를 관리 중이어도
  화면은 항상 "나 vs grant 대상"으로 고정된다.
- 쿼리 파라미터로 userId 를 받지 않는다 → 위조로 남의 데이터를 요청할 입력 자체가 없다.
- grant 가 여러 개면 owner 마다 선이 하나씩 추가된다(현재 실데이터는 1개).

## 5. 데이터

- 사람별 `snapshotService.getChartData(userId)` 를 `Promise.all` 로 병렬 호출 (Redis 캐시 1h, 변이 시 invalidate — 기존 그대로).
- USD 표시 모드 환산용 `getUsdExchangeRate()` 를 함께 조회해 클라이언트에 전달
  (홈 차트의 하드코딩 1435 를 따라가지 않는다 — 이 화면은 서버에서 실환율을 줄 수 있음).
- 값의 의미 (홈 차트와 동일):
  - 수익률 = 스냅샷 `profitRate` (평단 대비 누적 평가수익률, 이미 % 단위)
  - 총자산 = `totalAsset` = 주식 평가금 + 예수금

### 날짜 정렬 (클라이언트, 순수 함수)

- 키 = **KST 고정** `yyyy-MM-dd` (`kstDateKey`, `Intl.DateTimeFormat` `timeZone: 'Asia/Seoul'`). 실행 환경 로컬 타임존을 쓰면 서버(Vercel UTC)와 브라우저(KST)가 21:35Z 자동 스냅샷을 서로 다른 날로 그려 하이드레이션이 어긋난다(최종 리뷰에서 발견·수정). 요약 줄 기준일도 같은 키에서 만든다.
- 같은 사람이 같은 날 스냅샷을 여러 개 가지면 **그날 마지막 값**을 쓴다.
- 날짜 합집합으로 행을 만들고 사람별 컬럼(`s0`, `s1` …)에 값을 채운다. 한쪽에 그날 값이 없으면 `null`
  → Recharts `connectNulls` 로 선은 이어 그린다.
- 기간 필터(1M/3M/6M/1Y/전체, 기본 3M)는 홈 차트와 같은 `startDateForPeriod` 규칙으로 메모리에서 거른다.

## 6. 화면 구성

```
추이 비교                                    (hero-serif 제목, 더보기와 같은 헤더 스타일)

[수익률 | 자산]  [1개월 3개월 6개월 1년 전체]
┌──────────────────────────────────────┐
│  LineChart — 사람별 선 1개, 점 없음      │
│  수익률 모드: 0% 기준 점선                │
│  자산 모드: 억/만 축 포맷(홈 차트와 동일)   │
│  툴팁: 날짜 + 사람별 값                   │
└──────────────────────────────────────┘
● 나        +18.24%   45,200,000원   10.17 기준
● (owner명) +12.40%   21,800,000원   10.17 기준
```

- 선 색: 수익/손실 색(`--profit` 빨강 / `--loss` 파랑)과 겹치지 않게 **`--chart-3`(보라) = 나, `--chart-4`(주황) = 상대**.
  grant 가 더 있으면 `--chart-5` 순으로.
- 요약 줄: 사람별 **최신 스냅샷**의 수익률·총자산·기준일. 기간 필터와 무관(항상 최신).
  수익률 색은 기존 규칙(`text-profit`/`text-loss`).
- 카드/토글 스타일은 `PerformanceChart` 와 동일한 클래스 사용 (디자인 일관성).
- `loading.tsx` 스켈레톤 추가 (다른 대시보드 페이지와 동일 패턴).

### 빈 상태

- 한 사람만 스냅샷이 없으면: 그 사람 선은 안 그려지고 요약 줄에 "스냅샷 없음".
- 기간 내 데이터가 아무도 없으면: 차트 자리에 "이 기간에 스냅샷이 없습니다."

## 7. 변경 파일

| 파일 | 내용 |
|---|---|
| `app/dashboard/compare/page.tsx` (신규) | 서버: 접근 제어 + 사람별 차트 데이터·환율 조회 |
| `app/dashboard/compare/loading.tsx` (신규) | 스켈레톤 |
| `components/dashboard/compare-chart.tsx` (신규) | 클라이언트: 토글/기간/날짜 정렬/LineChart/요약 줄 |
| `app/dashboard/more/page.tsx` | 서버 껍데기로 전환 — grant 유무 조회 후 `MoreClient` 에 `showCompare` 전달 |
| `app/dashboard/more/more-client.tsx` (신규) | 기존 more 페이지 본문 이동 + `showCompare` 일 때 '함께 보기' 그룹 추가 |
| `lib/i18n/translations.ts` | `moreGroupShared` / `moreCompareTitle` / `moreCompareDesc` (ko/en) |

grant 없는 일반 사용자의 '더보기' 화면은 픽셀 변화 없음.

## 8. 검증

- `npx tsc --noEmit`, `npm run lint`, `npm run build` 통과
- cmux 브라우저(dev): grant 있는 계정으로 더보기 → 추이 비교 진입, 두 선·토글·기간·요약 줄 확인
- 관리 중(배너 노출) 상태에서 진입해도 "나 vs 상대" 로 고정되는지
- grant 없는 계정으로 `/dashboard/compare` 직접 접근 → `/dashboard/more` 로 리다이렉트, 메뉴 항목 미노출
