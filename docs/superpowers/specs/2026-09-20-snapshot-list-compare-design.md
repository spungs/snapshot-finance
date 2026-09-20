# 스냅샷 목록: 기간 검색 · 다중 선택 비교 · 추이 그래프

**작성일:** 2026-09-20
**상태:** 승인됨 (구현 착수)

## 문제

과거 스냅샷을 찾기 어렵다.

1. 목록이 무한스크롤이라 2022년 데이터를 보려면 204개를 계속 스크롤해야 한다.
   (연 250개씩 증가 — 2022년 1개 / 2025년 10개 / 2026년 273개로 밀도가 매우 불균등)
2. 필터가 단일 연/월이라 **"2022년 1월과 2025년 3월을 같이 보기"가 불가능**하다.
3. 비교가 2개로 제한된다.
4. 홈에는 있는 추이 그래프가 스냅샷 페이지에 없어 시각적 판단이 어렵다.

## 핵심 제약

떨어진 시점을 함께 보려면 **필터를 바꿔도 선택이 유지**돼야 한다.
현재는 선택 항목을 현재 목록(`snapshots` 배열)에서 `find` 하는 구조라, 필터를 바꾸면
이전 선택이 화면에서 사라진다. **선택 항목을 목록과 분리해 별도 보관하는 것이 이 기능의 뼈대다.**

## 설계

### 데이터 계층

| 변경 | 내용 |
|---|---|
| `GET /api/snapshots` | `from`/`to`(YYYY-MM-DD) 추가. `snapshotService.getList` 의 `{year, month}` 필터를 범위로 교체 |
| `GET /api/snapshots?ids=a,b,c` | **신설.** 선택 항목을 목록과 무관하게 holdings 포함 조회. 최대 10개 |
| `getChartData` | 반환에 `id` 추가 → 추이 그래프가 선택 항목을 식별. 캐시 1회 무효화 |

**무한스크롤 제거의 범위:** 자동 로드(`IntersectionObserver`)만 없앤다. cursor 페이징은
유지해 "더 보기" 버튼에 연결한다. 페이징까지 걷어내면 범위가 넓을 때 204개를 한 번에 불러온다.

### 상태 (`snapshots-client.tsx`)

- `range: { from: string; to: string } | null`
- `selectedIds: string[]` (최대 10)
- `selectedById: Record<string, Snapshot>` — 목록 밖 선택 항목 캐시. `?ids=` 로 채운다

### 화면

```
Hero
FilterBar        기간 범위(시작~종료) + 프리셋 칩 + 초기화
TrendChart       선택 있으면 그것만 / 없으면 현재 목록 구간
SelectionTray    선택 N개 칩 · 비우기 · [비교하기]
ActiveSnapshotCard
TimelineSection  체크박스 (상한 2 → 10)
[더 보기]
CompareSheet     요약 탭 / 종목 탭 (2개 선택 시 기존 SnapshotDiff 를 "상세" 탭으로 유지)
```

**비교 화면 형태**
- 요약 탭: 행=스냅샷, 열=날짜·총자산·수익률·종목수
- 종목 탭: 행=종목, 열=스냅샷(날짜). 없는 종목은 `—`

### 컴포넌트 분해

`snapshots-client.tsx` 가 이미 736줄이라 그대로 얹으면 1,200줄이 넘는다. 넷으로 쪼갠다.

- `components/dashboard/snapshots/snapshot-filter-bar.tsx`
- `components/dashboard/snapshots/snapshot-trend-chart.tsx`
- `components/dashboard/snapshots/snapshot-compare-sheet.tsx`
- `components/dashboard/snapshots/selection-tray.tsx`

`snapshots-client.tsx` 는 상태와 조립만 담당한다.
기존 `SnapshotBottomPanel` 은 `CompareSheet` 로 대체하되 `SnapshotDiff` 는 재사용한다.

### 금액 규약 (주의)

`snapshot_holdings` 의 `totalCost`/`currentValue`/`profit`/`profitRate` 는 **네이티브 통화**다.
원화가 필요하면 `currency==='USD'` 인 행에만 환율을 곱한다 — 매입액은 `purchaseRate`,
평가액은 스냅샷 `exchangeRate`. 비교표에서 이 규약을 어기면 금액이 환율배로 부푼다
(2026-09-20 커밋 8a14ede 가 고친 사고).

## 범위 밖 (YAGNI)

- 선택 상태의 localStorage 영속 — 세션 메모리만
- 비교 결과 URL 공유 / 전용 페이지
- "월말만 보기" 같은 밀도 축소 프리셋
- CSV 내보내기

## 검증

테스트 프레임워크가 없으므로:
- 순수 함수(범위 필터 계산, 비교표 행 병합)는 일회성 스크립트로 확인
- 화면은 cmux 브라우저 시나리오: **2022년 1개 선택 → 필터를 2025년으로 변경 → 선택이 유지되는지**,
  10개 선택 시 표와 그래프가 깨지지 않는지
