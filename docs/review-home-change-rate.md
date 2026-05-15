# 코드 리뷰: 일간/주간 변동률·변동금액 표시

> 작성일: 2026-05-14

---

## 구현 개요

커밋 `3daea0c` — `feat(home): 일간/주간 변동률·변동금액 표시`

| 구분 | 파일 |
|------|------|
| 신규 | `src/lib/utils/snapshot-comparison.ts` |
| 수정 | `src/components/home/home-client.tsx` |
| 수정 | `src/components/home/home-skeleton.tsx` |

---

## 발견된 버그 및 수정

### 🔴 Critical — 오늘 스냅샷 필터링 버그 (수정 완료)

**파일:** `lib/utils/snapshot-comparison.ts`

- **증상:** 어제 스냅샷이 없을 때 실시간 잔고 vs 오늘 스냅샷을 비교해 일간 변동 ≈0%p 오표시
- **원인:** `snapshotDate`가 Timestamptz (KST 17:00 cron → UTC 08:00 저장), `d < targetDate` 밀리초 비교에서 오늘 스냅샷이 `candidates`에 포함됨
- **수정:** `daysDiff(d, targetDate) < 0` 으로 UTC day 단위 비교
- **커밋:** `fix(home): 일간/주간 변동 스냅샷 필터 버그·Skeleton 레이아웃 shift 수정`

### 🟠 Medium — HomeSkeleton 레이아웃 shift (수정 완료)

**파일:** `src/components/home/home-skeleton.tsx`

- **증상:** 로딩 완료 후 일간/주간 섹션 삽입 시 레이아웃 shift 발생
- **원인:** `home-skeleton.tsx`에 일간/주간 카드 섹션 없음
- **수정:** skeleton에 동일 2열 카드 섹션 추가

---

## 검증된 올바른 구현

- `calcChange` 로직, `profitRateDiff`(%p) 단위 — 정확
- 스냅샷 0개/1개 edge case — `snapshots.length < 2` 가드 처리
- `daysDiff` UTC 일관성 — KST 환경 문제없음
- `hasChangeData` null safety — 섹션 조건부 렌더 올바름
- `convert(Math.abs(change.totalValueDiff))` 통화 변환 — KRW diff에 올바르게 적용
- 모바일 `grid-cols-2` — `max-w-[480px]` 범위 내 2열 표시 충분

---

## 향후 개선 여지 (Minor)

- `ChangeResult.referenceDate`, `daysApart` 현재 UI 미사용 — "N월 M일 스냅샷 대비" 툴팁 추가 시 활용 가능
