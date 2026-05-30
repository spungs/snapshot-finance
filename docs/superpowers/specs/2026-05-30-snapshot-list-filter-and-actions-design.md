# 스냅샷 메뉴 개선 — 기간 필터 · 큰 카드 액션 · 상세 시뮬레이션

- 최종 업데이트: 2026-05-30
- 상태: 설계 확정 (구현 대기)
- 관련 화면: `/dashboard/snapshots`, `/dashboard/snapshots/[id]`

## 배경 / 문제

현재 스냅샷 목록은 cursor 기반 무한스크롤만 제공한다. 다음 3가지 불편이 확인됨:

1. **(R1) 과거 특정 월 탐색 곤란** — "작년 11월에 자산이 얼마였고 무슨 종목을 들고 있었는지" 보려면 무한스크롤로 한참 내려야 한다. 날짜 범위 필터가 없다.
2. **(R2) 큰 카드에 진입 액션 없음** — 타임라인 카드를 누르면 최상단의 큰 카드(`ActiveSnapshotCard`)로 해당 스냅샷이 올라오지만, 그 카드에는 상세보기 버튼이 없어 다시 스크롤해 원래 카드를 찾아 `상세`를 눌러야 한다.
3. **(R3) 상세페이지에 시뮬레이션 진입 없음** — 상세페이지 더보기 메뉴에 `편집`/`삭제`만 있고, "이 시점으로 시뮬레이션" 진입이 없다. 타임라인 카드에는 이미 있다.

## 목표 / 성공 기준

- R1: 목록 상단에서 연·월을 선택하면 그 달 스냅샷만 즉시 표시되고, `전체`로 무한스크롤 복귀가 된다. 데이터가 있는 연·월만 선택지로 보인다.
- R2: 큰 카드 하단에서 스크롤 없이 `상세보기`(→ 상세페이지)와 `시뮬레이션`(→ 시뮬레이션)으로 이동할 수 있다. 액션 영역이 카드 요약을 압도하지 않는다.
- R3: 상세페이지 더보기 메뉴에서 `시뮬레이션`으로 `/dashboard/simulation?snapshotId=<id>`로 이동한다.
- DB 스키마/마이그레이션 변경 없음 (읽기 필터만 추가).

## 설계

### R1 — 기간(연/월) 필터

**UX**
- 목록 `Hero` 아래에 필터 바: `[ 연도 ▾ ] [ 월 ▾ ]  전체`.
- 연/월 드롭다운은 **실제 스냅샷이 존재하는 연·월만** 노출(빈 달 선택 방지). 서버가 보유 연·월 목록을 함께 내려준다.
- 연·월 선택 시 → 그 달 스냅샷만 표시. `전체` 탭 → 기존 무한스크롤 복귀.
- 필터가 걸린 상태에서도 기존 cursor 무한스크롤 로직을 그대로 사용한다(한 달에 31건을 넘겨도 안전). 즉 **기존 페이지네이션에 날짜 조건만 얹는다**.
- 필터 변경 시: `activeId`는 새 목록의 첫 항목으로 재설정, 비교 선택(`selectedIds`)은 초기화(필터 경계를 넘는 비교 혼동 방지).
- 선택한 달에 스냅샷이 없을 때는 간결한 빈 상태 문구만 표시(과한 경고 박스 지양 — 기록앱 톤).

**서버 (`lib/services/snapshot-service.ts`)**
- `getList(userId, limit, cursor, filter?)` — `filter = { year, month }`이면 `where`에 날짜 범위 추가:
  - `snapshotDate: { gte: new Date(year, month-1, 1), lt: new Date(year, month, 1) }`
- 신규 `getAvailableMonths(userId)` — `snapshotDate`만 select(`orderBy desc`)해서 JS에서 distinct `{ year, month }` 목록을 내림차순으로 반환. (행 수가 많아도 날짜 컬럼만 읽으므로 가벼움. 기존 `getChartData`도 전체 스냅샷을 읽는 패턴이 있어 부담이 유사 수준.)

**API (`app/api/snapshots/route.ts`)**
- `year`, `month` 쿼리 파라미터 파싱 + 검증/클램프(`month` 1–12, `year`는 정수). 둘 다 있을 때만 필터 적용.
- 기존 `limit`/`cursor` 처리는 유지하고 `getList`에 `filter`를 전달.

**API 클라이언트 (`lib/api/client.ts`)**
- `snapshotsApi.getList(cursor?, signal?, filter?)` — `filter`가 있으면 `&year=&month=` 쿼리 추가.

**페이지 (`app/dashboard/snapshots/page.tsx`)**
- `getAvailableMonths(userId)` 호출 결과를 `SnapshotsClient`에 `availableMonths` prop으로 전달(초기 렌더는 기존대로 최신 20건 = 전체 모드).

**클라이언트 (`app/dashboard/snapshots/snapshots-client.tsx`)**
- 필터 상태 `filter: { year, month } | null` 추가.
- 필터 변경 → 첫 페이지부터 새로 fetch(cursor 없이 `filter` 포함), 목록 교체, `nextCursor`/`hasMore`도 그 응답 기준으로 갱신.
- `loadMore`는 현재 `filter`를 함께 넘겨 무한스크롤이 필터 안에서 작동.
- `전체` → `filter = null`로 첫 페이지 재fetch.

### R2 — 큰 카드(ActiveSnapshotCard) 컴팩트 액션 라인

디자이너 진단 결과 **풀폭 솔리드 2버튼은 지양**(타임라인 패턴과 충돌, 위계 평평, 세로 ~60px, 솔리드 초록이 `--loss`/FAB와 색 충돌). 추천안 **(B) 컴팩트 단일 라인** 채택.

- 위치: 손익 2칼럼 행 직후.
- 구성: `상세보기`(primary **텍스트 링크**, 솔리드 X, `Eye` 아이콘) + 우측 `⋮` 드롭다운(`MoreVertical`) → 항목 `시뮬레이션`(`TrendingUp`).
- 동작: `상세보기` → `/dashboard/snapshots/<id>`, `시뮬레이션` → `/dashboard/simulation?snapshotId=<id>`.
- 큰 카드에는 삭제·비교를 넣지 않는다(타임라인/상세에 이미 존재, 큰 카드는 요약 + 진입이 1차 목적).
- Tailwind 가이드:
  - 행: `flex items-center justify-between mt-4 pt-3 border-t border-border/60`
  - `상세보기`: `text-[12px] font-semibold text-primary hover:underline inline-flex items-center gap-1`, `Eye w-3.5 h-3.5`
  - `⋮` 버튼: `p-1.5 -mr-1.5 text-muted-foreground hover:text-foreground`, `MoreVertical w-4 h-4`, `aria-label` 필수
  - 드롭다운: 기존 `DropdownMenu`/`DropdownMenuItem` 재사용

### R3 — 상세페이지 더보기 메뉴에 시뮬레이션

- `app/dashboard/snapshots/[id]/snapshot-detail-client.tsx`의 헤더 `DropdownMenuContent`에 `시뮬레이션` 항목을 **편집 위**에 추가.
- `onClick={() => router.push('/dashboard/simulation?snapshotId=' + snapshot.id)}`, `TrendingUp` 아이콘, i18n `t('simulation')`.

## 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `lib/services/snapshot-service.ts` | `getList`에 `filter` 인자 + `getAvailableMonths` 신규 |
| `app/api/snapshots/route.ts` | `year`/`month` 파싱·검증·전달 |
| `lib/api/client.ts` | `snapshotsApi.getList`에 `filter`(year/month) |
| `app/dashboard/snapshots/page.tsx` | `getAvailableMonths` 호출·`availableMonths` 전달 |
| `app/dashboard/snapshots/snapshots-client.tsx` | 필터 바 UI·상태, `loadMore`에 필터 thread, `ActiveSnapshotCard`에 (B) 컴팩트 액션 라인 |
| `app/dashboard/snapshots/[id]/snapshot-detail-client.tsx` | 더보기 드롭다운에 시뮬레이션 |
| `lib/i18n/translations.ts` | 신규 키(ko/en) |

## i18n 신규 키 (ko/en)

- `allPeriods` — `전체` / `All`
- `selectYear` / `selectMonth` — 드롭다운 접근성 라벨
- `noSnapshotsInPeriod` — `이 기간에 스냅샷이 없어요` / `No snapshots in this period`
- (기존 재사용) `details`, `simulation`, `loadingMore`, `noMoreSnapshots`

## 범위 제외 (YAGNI)

- DB 스키마/마이그레이션 변경 없음.
- 손익 기준 정렬, 종목/메모 검색, 기간 범위(from–to) 입력은 이번 범위 밖.
- 큰 카드에 삭제/비교 추가하지 않음.

## 검증 방법

1. `npm run build` 통과(운영 push 전 풀빌드 필수).
2. 목록: 연/월 선택 → 그 달만 표시, `전체` → 무한스크롤 복귀, 데이터 없는 달 미노출, 빈 달 빈 상태.
3. 큰 카드: `상세보기`/`⋮→시뮬레이션` 이동 동작, 라이트/다크 시각 확인, 액션 영역이 요약을 압도하지 않음.
4. 상세페이지: 더보기 → 시뮬레이션 이동(`snapshotId` 쿼리 전달) 확인.
