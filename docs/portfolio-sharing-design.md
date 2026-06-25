# 포트폴리오 인앱 공유 기능 설계 문서

> 최종 업데이트: 2026-06-25
> 상태: **설계 단계 (구현 전)**

## 1. 배경 & 목표

한 사용자가 다른 사용자의 포트폴리오를 관리/조언해 줄 때, 현재는 **스크린샷 이미지를 복사해서 전달**하는 방식에 의존한다. 이는 데이터 주인(여자친구)에게도 번거롭고, 관리자(나)도 앱에서 직접 볼 수 없어 불편하다.

**목표:** 한 사용자가 자신의 포트폴리오를 다른 사용자에게 **읽기 전용**으로 공유하고, 공유받은 사람이 자신의 대시보드에서 **포트폴리오를 전환해 실시간으로 열람**할 수 있게 한다.

### 확정된 방향 (의사결정 완료)

| 항목 | 결정 |
|---|---|
| 권한 범위 | **읽기 전용** (수정 불가, 추후 editor role 확장 여지만 확보) |
| 공유 방식 | **인앱 계정 연결** (양쪽 모두 로그인 사용자) |
| 공유 방향 | **단방향** (owner → viewer, 예: 여친 → 나) |

### 비목표 (이번 범위 아님)

- 공유받은 사람의 포트폴리오 **수정/대리 관리** (editor role — 추후)
- **양방향** 상호 공유 (모델은 단방향 row 2개로 표현 가능하나 UI는 이번 범위 밖)
- 로그인 없이 보는 **공개 토큰 링크** (`/share/[token]`) — 인앱 연결로 대체되어 불필요
- 이메일 발송 인프라 구축

---

## 2. 핵심 설계 원칙

### 2.1 단일 관문: `getViewContext()`

현재 데이터 읽기 경로 **54개 지점**이 모두 `session.user.id`를 일관되게 사용한다. 공유 열람을 위해 "세션 사용자"와 "조회 대상 사용자"를 분리해야 하는데, 이를 각 지점에 흩어 놓으면 보안 구멍이 생긴다. → **모든 읽기 경로가 거치는 단일 헬퍼**로 강제한다.

```ts
// lib/services/view-context.ts (신규)
type ViewContext = {
  sessionUserId: string;   // 로그인한 본인 (항상)
  targetUserId: string;    // 실제 조회 대상 (본인 또는 공유받은 owner)
  isOwnView: boolean;      // 본인 포트폴리오 여부
  role: 'owner' | 'viewer';
};

// 동작:
// 1. 세션에서 sessionUserId 확보 (없으면 401)
// 2. 요청의 viewingAs 값(쿠키 또는 ?as=) 확인
// 3. viewingAs 없음 → 본인 뷰 반환
// 4. viewingAs 있음 → PortfolioShare(owner=as, viewer=session, status=accepted) 검증
//    - 검증 실패 → 403 (또는 본인 뷰로 graceful fallback)
//    - owner.deletedAt != null → 403 (소프트 삭제된 owner 차단)
// 5. 검증 통과 → { targetUserId: as, isOwnView: false, role: 'viewer' }
```

**불변식:**
- 읽기 경로는 `session.user.id`를 직접 쓰지 않고 **반드시 `targetUserId`를 사용**한다.
- **모든 변이(쓰기) 경로는 절대 `targetUserId`를 쓰지 않고 `sessionUserId`만 사용**한다. (남의 데이터 쓰기 원천 차단)
- **설정 페이지는 view context를 적용하지 않는다.** (테마/언어/탈퇴 등은 언제나 본인 것)

### 2.2 읽기 전용 강제는 "3중"으로

1. **백엔드:** 변이 엔드포인트는 view context를 받지 않으므로 구조적으로 본인 것만 수정 (이미 안전).
2. **UI:** 열람 모드(`isOwnView === false`)에서 모든 변이 UI(종목 편집, 스냅샷 생성/수정/삭제, AI 챗 FAB, 예수금 편집)를 **숨김 + 비활성화**.
3. **표시:** "읽기 전용" 뱃지를 헤더에 노출해 혼선 방지.

> ⚠️ 변이 UI를 단순히 두면, 화면은 여친 것인데 버튼을 누르면 **본인 포트폴리오가 바뀌는** 조용한 사고가 난다. 반드시 숨겨야 한다.

---

## 3. 데이터 모델

```prisma
model PortfolioShare {
  id           String    @id @default(cuid())
  ownerUserId  String    // 데이터 주인 (공유하는 사람)
  viewerUserId String?   // 열람자 — 수락 시 채워짐 (초대 발송 시점엔 null)
  viewerEmail  String    // 초대 대상 이메일 (수락 전 식별 + 신원 매칭)
  status       String    @default("pending") // pending | accepted | revoked
  role         String    @default("viewer")  // 현재 viewer 고정, 추후 editor 확장
  createdAt    DateTime  @default(now())
  acceptedAt   DateTime?
  revokedAt    DateTime?

  owner  User  @relation("SharesAsOwner",  fields: [ownerUserId],  references: [id], onDelete: Cascade)
  viewer User? @relation("SharesAsViewer", fields: [viewerUserId], references: [id], onDelete: Cascade)

  // 재초대 충돌 방지: 동일 (owner, email) 쌍은 활성 1건만 — 부분 유니크 인덱스로 처리
  // (revoked row는 남겨두되 재초대를 막지 않도록 status 미포함 유니크는 사용하지 않음)
  @@index([ownerUserId, viewerEmail])
  @@index([viewerUserId, status])
  @@map("portfolio_shares")
}
```

`User` 모델에 역참조 추가:
```prisma
  sharesAsOwner  PortfolioShare[] @relation("SharesAsOwner")
  sharesAsViewer PortfolioShare[] @relation("SharesAsViewer")
```

### 3.1 재초대 / 유니크 제약 처리

`@@unique([ownerUserId, viewerEmail])`를 단순 적용하면 **해제(revoked) 후 재초대가 막힌다**(기존 row가 남아서). 두 가지 선택:

- **(권장) 부분 유니크 인덱스** — `status IN ('pending','accepted')`인 row만 (owner, email) 유니크. revoked는 제약 밖. Prisma는 부분 인덱스를 직접 표현 못 하므로 **마이그레이션 SQL에 raw `CREATE UNIQUE INDEX ... WHERE status <> 'revoked'` 추가**.
- (대안) 재초대 시 기존 row를 `upsert`로 재활용(status를 pending으로 되돌림).

### 3.2 마이그레이션 (CLAUDE.md 규칙 준수)

- schema 변경과 **같은 커밋**에서 `npx prisma migrate dev --name add_portfolio_share` 실행.
- 부분 유니크 인덱스는 생성된 마이그레이션 SQL을 수동 편집해 추가.

---

## 4. 사용자 흐름

### 4.1 공유 걸기 (owner = 여자친구)

1. 설정 → "내 포트폴리오 공유" 섹션 → 상대(나)의 이메일 입력
2. `PortfolioShare(status='pending', viewerEmail=내이메일)` 생성
3. 전달: **초대 링크 복사**(카톡 등으로 전달) + 상대 로그인 시 **대시보드 수락 배너** (둘 다 지원 권장)
4. 언제든 같은 화면에서 **공유 해제**(status='revoked', revokedAt 기록)

### 4.2 수락 (viewer = 나)

1. 초대 링크 클릭 또는 대시보드 배너에서 "수락"
2. **수락은 초대된 이메일로 로그인한 사용자만 가능** (Google 계정 이메일 매칭 — 의도된 신원 안전장치)
3. 수락 시 `viewerUserId = 세션userId`, `status='accepted'`, `acceptedAt` 기록

### 4.3 열람 (viewer)

1. 대시보드 헤더에 **포트폴리오 스위처** 등장: `내 포트폴리오 ▾ / 💑 여자친구`
2. 대상 선택 → 쿠키 `viewingAs`에 ownerId 저장 (새로고침해도 유지)
3. 홈/포트폴리오/스냅샷이 **여친의 실시간 데이터**로 읽기 전용 표시
4. 변이 UI 전부 숨김 + "읽기 전용" 뱃지

---

## 5. 영향 범위 (코드 변경 지점)

### 5.1 읽기 경로 — `targetUserId`로 전환

`getViewContext()`를 거치도록 변경. **User 직속 자산 필드도 함께 전환**해야 한다(아래 5.3).

- `lib/services/holding-service.ts` — 보유/예수금 조회 (`:134` cashBalance 등)
- `lib/services/snapshot-service.ts` — 스냅샷 조회
- `app/dashboard/page.tsx` (홈), `app/dashboard/portfolio/page.tsx`, `app/dashboard/snapshots/*`
- `app/api/holdings`, `app/api/snapshots`, `app/api/user` 등 읽기 API
- ⚠️ 홈/포트폴리오/스냅샷 **모두**가 대상 — "포트폴리오 페이지 한 곳"이 아니다.

### 5.2 AI 어시스턴트 — 열람 모드 비활성화 (치명적)

- `app/api/ai/portfolio/route.ts` — 세션 userId로 동작하며 `add/update/delete_holding` **쓰기 함수** 포함.
- 열람 중 AI를 열면 **화면은 여친, AI는 내 데이터**를 읽고 내 걸 수정하는 혼선 발생.
- 조치: 열람 모드에서 **AI FAB 자체를 렌더 안 함**. (PRO 전용이라 노출 빈도는 낮지만 반드시 차단)

### 5.3 User 직속 자산 필드 (예수금/목표자산)

- `cashBalance`, `cashAccounts`, `targetAsset`는 `Holding`이 아니라 **User 행**에 있음.
- 총자산 = 주식 평가 + 예수금 → 예수금은 **함께 표시되어야 정상**.
- `getViewContext`가 holdings뿐 아니라 **target User 행 자체**를 로드해야 함.
- 시뮬레이션 페이지의 `targetAsset` 사용도 동일 맥락 (열람 모드 노출 여부는 5.6 참고).

### 5.4 변이 UI 숨김

- 종목 추가/편집/삭제, 예수금 편집, 스냅샷 생성/수정/삭제 버튼 → `isOwnView === false`일 때 숨김.
- 백엔드는 이미 세션 기준이라 안전하나, 혼선 방지를 위해 UI 차단 필수.

### 5.5 설정 페이지 — 스위처 무시

- 설정은 항상 본인 것. view context를 적용하지 않음. 스위처 상태와 무관하게 `session.user.id` 고정.

### 5.6 시뮬레이션 / What-If

- 시뮬레이션은 `targetAsset` 기반 — 열람 모드에서 **읽기 전용으로 보여줄지 / 숨길지** 결정 필요(아래 9. 미결).
- What-If는 공개/임의입력 기반이라 영향 없음.

---

## 6. API / Server Action 설계

| 동작 | 위치(안) | Rate limit |
|---|---|---|
| 초대 생성 | `actions/shares.ts` 또는 `POST /api/shares` | `ratelimit.api` |
| 초대 수락 | `POST /api/shares/[id]/accept` | `ratelimit.api` |
| 초대 거절/해제 | `POST /api/shares/[id]/revoke` | `ratelimit.api` |
| 받은 공유 목록 | `GET /api/shares` (viewer 기준) | (선택) |
| 뷰 전환 | 쿠키 `viewingAs` set (서버에서 검증) | — |

- 모든 변이성 공유 엔드포인트에 `ratelimit.api` 적용 (남용 차단).
- 공유 포트폴리오 **조회 자체는 기존 읽기 경로 재사용** (별도 rate limit 불필요).

---

## 7. 보안 & 엣지 케이스

| 케이스 | 처리 |
|---|---|
| 공유 해제 직후 열람 시도 | `getViewContext`가 매 요청 검증 → 403, 쿠키 정리 후 본인 뷰로 fallback |
| owner 소프트 삭제(`deletedAt`) | `getViewContext`에서 차단 (cron 하드삭제 전이라도 노출 금지) |
| owner/viewer 하드 삭제(30일 cron) | `onDelete: Cascade`로 share row 자동 정리 |
| 자기 자신 초대 | viewerEmail == owner email → 거부 |
| 초대 이메일 ≠ 실제 Google 이메일 | 수락 불가 (의도된 신원 안전장치) |
| 미가입자 초대 | `pending` 유지, 상대가 로그인하면 배너로 수락 유도 |
| 재초대(해제 후) | 부분 유니크 인덱스로 허용 (3.1 참고) |
| 변이 엔드포인트 우회 호출 | 구조적으로 `sessionUserId`만 사용 → 남의 데이터 불가 |

---

## 8. 기존 기능과의 관계

- `components/dashboard/portfolio-share.tsx` (PNG/JSON 내보내기): **충돌 없음.**
  - 기존 = "순간 스냅샷을 외부(카톡/메일)로 내보내기"
  - 신규 = "실시간 인앱 열람 링크"
  - 열람 모드에서도 PNG 내보내기를 켜두면 "여친 포트폴리오를 PNG로" 도 가능 (보너스, 선택).
- `middleware.ts`: 양쪽 모두 로그인 사용자이므로 **공개 라우트 추가 불필요**, 매처(`/dashboard/:path*`) 거의 그대로. (공개 토큰 링크 방식 대비 큰 장점)
- 환율: 실시간 열람이라 볼 때마다 현재 환율로 재계산 → **시점 고정 이슈 없음**. base currency는 열람자 localStorage 기준(원화로 보면 됨).

---

## 9. 미결정 사항 (구현 전 확정 필요)

1. **초대 전달 방법** — (a) 링크 복사 전달 (b) 로그인 시 수락 배너. → 권장: **둘 다 지원**.
2. **스위처 UI 위치** — 헤더(`site-header`) vs 홈 상단. → 권장: 헤더 드롭다운(전 페이지 일관).
3. **열람 모드에서 시뮬레이션 노출 여부** — 읽기 전용 표시 vs 숨김.
4. **공유 시 owner 동의/약관** 문구 필요 여부 (금융정보 제3자 열람).

---

## 10. 단계별 작업 순서 (구현 시)

1. `PortfolioShare` 모델 + 마이그레이션(부분 유니크 인덱스 포함)
2. 초대/수락/해제 API or Server Action (+ rate limit)
3. `getViewContext()` 헬퍼 + 읽기 경로 `targetUserId` 전환 (holdings/snapshots/User 직속 필드)
4. 대시보드 포트폴리오 스위처 UI + `viewingAs` 쿠키
5. 설정 페이지: "공유하기"(owner) + "받은 공유/수락"(viewer) 섹션
6. 열람 모드 변이 UI 숨김/비활성 + AI FAB 차단 + "읽기 전용" 뱃지

---

## 부록 A: 위험도 요약

| 항목 | 위험도 | 핵심 조치 |
|---|---|---|
| 읽기 경로 userId 분리 (54곳) | 🔴 | `getViewContext` 단일 관문 강제 |
| AI 어시스턴트 데이터 혼선 | 🔴 | 열람 모드 FAB 차단 |
| owner 소프트 삭제 노출 | 🔴 | view context에서 `deletedAt` 차단 |
| User 직속 자산필드 전환 | 🟡 | target User 행 로드 |
| 재초대 유니크 충돌 | 🟡 | 부분 유니크 인덱스 |
| 변이 UI 혼선 | 🟡 | 숨김 + 읽기전용 뱃지 |
| 설정 페이지 오염 | 🟡 | 설정은 view context 미적용 |
| 환율 시점 | 🟢 | 실시간 재계산 (무관) |
| 공개 라우트/middleware | 🟢 | 인앱 연결이라 불필요 |
| 기존 PNG 공유 충돌 | 🟢 | 없음 (보완 관계) |
