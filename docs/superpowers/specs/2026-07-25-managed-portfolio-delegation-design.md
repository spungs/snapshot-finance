# 위임 포트폴리오 관리 (Managed Portfolio Delegation) — 설계

- 최종 업데이트: 2026-07-25
- 상태: 설계 확정, 구현 계획(writing-plans) 대기
- 관련: `prisma/schema.prisma`, `lib/auth.ts`, `app/dashboard/**`, `app/api/**`, `app/actions*`

## 1. 배경 / 목표

현재 이 앱은 **한 로그인 = 한 포트폴리오**로, 모든 데이터(Holding, PortfolioSnapshot,
BrokerageAccount, cashBalance/targetAsset/cashAccounts)를 `session.user.id` **하나**로만
스코핑한다(65곳 / 약 30파일).

실사용자가 나와 여자친구 둘뿐이며, **여자친구도 본인 구글 계정으로 로그인**하되
그녀의 포트폴리오는 **내가 대신 CRUD** 관리하기로 했다. 이를 위해 "지금 로그인한 사람"과
"데이터를 읽고 쓸 대상"을 분리하는 **단방향 위임 레이어**를 추가한다.

## 2. 확정된 결정

1. 실제 User 두 개(나, 여자친구). 여자친구도 본인 계정으로 로그인한다.
2. **나 → 그녀 단방향 위임**. 수동 세팅(범용 초대 기능 없음).
3. 나는 그녀 포트폴리오를 **풀 CRUD**(editor)로 관리한다.
4. 연결은 **소스 하드코딩도, User 컬럼 추가도 아닌** 전용 관계 테이블의 **데이터 행 1개**로 표현한다.

## 3. 비목표 (YAGNI)

- 이메일 초대 UI 없음
- viewer 역할 구현 없음(스키마에 `role` 여지만 남김)
- 양방향/상호 관리 없음
- 종목별 세부 권한 없음

## 4. 데이터 모델 — 마이그레이션 1개

기존 컬럼/데이터는 **무변경**. 관계 테이블 하나만 신설한다.

```prisma
model PortfolioAccess {
  id        String   @id @default(cuid())
  ownerId   String   // 포트폴리오 주인 (여자친구)
  granteeId String   // 관리 권한을 받는 사람 (나)
  role      String   @default("editor") // 현재 editor 하나. 향후 viewer 확장 여지
  createdAt DateTime @default(now())
  owner     User     @relation("AccessOwner",   fields: [ownerId],   references: [id], onDelete: Cascade)
  grantee   User     @relation("AccessGrantee", fields: [granteeId], references: [id], onDelete: Cascade)

  @@unique([ownerId, granteeId])
  @@index([granteeId])
  @@map("portfolio_access")
}
```

User 모델에는 역방향 relation 2줄만 추가한다.

```prisma
// model User { ... }
grantedAccess  PortfolioAccess[] @relation("AccessOwner")   // 내가 남에게 위임한 것
receivedAccess PortfolioAccess[] @relation("AccessGrantee") // 남이 나에게 위임한 것
```

> 마이그레이션은 `npx prisma migrate dev --name add_portfolio_access`로 생성한다.
> 운영/로컬 두 DB 모두에 적용해야 한다(프로젝트 규칙).

## 5. 중앙 리졸버 — `lib/portfolio-context.ts` (신규)

모든 데이터 경로가 `session.user.id` 대신 이 함수를 호출한다.

```ts
export async function getPortfolioContext(): Promise<{
  actorId: string          // 지금 로그인한 사람(나) — 신원/quota/rate-limit 용
  portfolioUserId: string  // 데이터를 읽고 쓸 대상(나 또는 그녀)
  isManaging: boolean      // 남의 포트폴리오를 보는 중인가
  ownerName?: string       // 배너 표시용
} | null>
```

동작:

1. `auth()`로 `actorId` 확보. 없으면 `null`(기존과 동일하게 401/redirect).
2. `active_portfolio` **쿠키**를 읽는다. 없거나 `== actorId`면 내 것(`isManaging: false`).
3. 쿠키에 owner id가 있으면 **DB에서 `PortfolioAccess(ownerId=쿠키, granteeId=actorId)` grant를
   검증**한다. 있으면 그 id를 반환, 없으면 **조용히 내 것으로 폴백**한다.

> **보안 핵심:** 쿠키는 "누구를 보고 싶다"는 요청일 뿐이고, 권한은 **매 요청 서버에서 grant로
> 재검증**한다. 쿠키 단독은 절대 신뢰하지 않는다. 위조된 쿠키는 self로 폴백된다.

## 6. "데이터 vs 신원" 분류 규칙

교체는 두 갈래뿐이다.

| 분류 | userId 소스 | 대상 |
|---|---|---|
| **포트폴리오 데이터**(읽기/쓰기) | `portfolioUserId` | holdings·snapshots·accounts·cash·simulation 전 경로, `updateTargetAsset`, admin-actions(일괄 등록: analyze/execute/list/cashBalance), AI portfolio의 **계좌 조회 부분** |
| **신원/계정 설정**(항상 나) | `actorId` | 회원탈퇴·약관동의·logout/googleLogin, `toggleAutoSnapshot`·`/api/user`(계정 설정), AI role/PRO 판정, **모든 rate-limit / AI·시뮬 quota 키** |

> **구현 중 정제된 경계 (design 대비 조정):**
> - `toggleAutoSnapshot`·`/api/user`(자동 스냅샷 on/off)와 settings 페이지는 **계정 설정**이라 각자 본인 것만 관리(actor). 여자친구도 로그인하므로 자기 auto-snapshot·약관·탈퇴는 스스로 관리한다. 포트폴리오 **데이터**(holdings/snapshots/cash/accounts/target/simulation)만 위임된다.
> - `app/actions/admin-actions.ts`는 이름과 달리 admin 전용이 아니라 **일괄 등록(bulk import) 데이터 작업**이다(역할 체크 없음, holdings 생성/조회). 따라서 데이터→`portfolioUserId`, rate-limit 키만 `actorId`.
> - AI/PRO/역할 판정은 actor 기준이므로, portfolio 페이지의 `isProUser`도 `actorId` 로 맞춰 AI 라우트(서버)와 클라이언트 게이트를 일치시켰다. (리졸버는 `actorName`·`actorRole` 필드를 추가로 제공)
> - `app/api/ai/ocr-import`는 userId 사용이 전부 actor(entitlement/quota)라 무변경. 실제 등록 데이터 스코핑은 내부 호출하는 `analyzeBulkImport`(→portfolioUserId)가 담당.

핵심 규칙 3가지:

- **quota·rate-limit은 항상 `actorId`.** 내가 그녀 걸 관리해도 내 quota를 쓰고 그녀 quota를
  소진시키지 않는다. (AI portfolio route는 "데이터=그녀, 카운터=나"로 한 파일 안에서 분리)
- **회원탈퇴는 위임 모드에서 하드 잠금.** delegation으로 그녀 계정을 지울 수 없도록 `actorId`로만
  동작 + 관리 모드일 때 UI 비활성화(2중 방어).
- **`isAutoSnapshotEnabled` 표시는 DB에서.** 이 값은 현재 JWT 세션에 캐시되므로, 관리 모드에서는
  세션 토큰(내 값) 대신 `portfolioUserId`의 DB 값을 읽어 토글을 표시한다.

### before / after (최소 변경)

```ts
// AS-IS
const session = await auth()
if (!session?.user?.id) redirect('/auth/signin')
const data = await holdingService.getList(session.user.id)

// TO-BE
const ctx = await getPortfolioContext()
if (!ctx) redirect('/auth/signin')
const data = await holdingService.getList(ctx.portfolioUserId)
```

`holdingService`·`snapshotService` 등 서비스의 시그니처는 **변경 없음**(넘기는 userId만 다름).
IDOR 체크 `assertAccountOwnership(accountId, portfolioUserId)`도 그녀 계좌를 정상 통과시킨다.

## 7. UI — 프로필 스위처 & 안전장치

### 7-1. 스위처
- 위치: `app/dashboard/layout.tsx` 헤더 우측(`ScreenHeader`의 `right` prop, 아바타 자리).
- **노출 조건:** `actorId`가 받은 grant가 1개 이상일 때만 노출 → 일반 사용자(여자친구 포함)에겐
  화면 변화 0. 나에게만 보인다.
- 내용: `내 포트폴리오` + grant 준 owner 목록(여기선 "여자친구").

### 7-2. 전환
- 항목 선택 → 서버 액션 `setActivePortfolio(ownerIdOrSelf)`가 `active_portfolio` 쿠키를
  set/clear하고 `/dashboard`를 revalidate → 다음 SSR이 리졸버로 재해석.
- 쿠키: `httpOnly`, `sameSite=lax`, path=`/`, **지속 쿠키**(리로드·PWA 재실행에도 유지).

### 7-3. 안전장치(실수 방지 — 가장 중요)
- 헤더 아래 **상시 배너 + 구분 색조**: `👤 여자친구 포트폴리오를 관리 중` + `[내 포트폴리오로 →]`.
- 지속 쿠키의 유일한 footgun(다음날에도 그녀 모드)은 이 배너/색조로 상쇄한다.
- 회원탈퇴는 관리 모드에서 **UI 비활성화 + 서버 `actorId` 하드 잠금**.

## 8. 세팅 / 철회 (수동, 1회)

- 스크립트 `scripts/grant-portfolio-access.ts`: owner id + grantee 이메일을 받아 `PortfolioAccess`를
  upsert. 실제 id는 **실행 인자로만** 전달하며 소스에 남기지 않는다.

```bash
npx tsx scripts/grant-portfolio-access.ts \
  --owner-id <여자친구_user_id> \
  --grantee-email <내_이메일>
```

- 선행조건: 여자친구가 **최소 1회 로그인**해서 User row가 존재해야 한다(이미 존재 확인됨).
- 철회: 해당 행 하나 삭제 → 다음 요청부터 자동 self 폴백. 재배포 불필요.

## 9. 보안 / 엣지케이스 체크리스트

- **쿠키 위조:** 매 요청 grant 재검증으로 무력화(폴백). 미들웨어 무변경(계속 `auth`로 `/dashboard` 보호).
- **캐시 격리:** `holdings:list:{userId}` 키가 userId별이라 그녀 캐시와 내 캐시가 자동 분리. 변이 후
  invalidate도 `portfolioUserId`로 나가 정상.
- **AI 어시스턴트:** 그녀 holdings에 쓰기 허용(데이터=그녀), quota·rate-limit=나(actorId).
- **시뮬레이션/what-if 월 quota:** 카운터=`actorId`, 데이터=`portfolioUserId`.
- **자동 스냅샷 cron:** **무변경.** 그녀 스냅샷은 그녀 User의 `isAutoSnapshotEnabled` + 그녀 holdings로
  독립 생성된다. delegation과 무관.
- **회원탈퇴:** 관리 모드에서 하드 잠금(위 7-3, 6).

## 10. 검증 방법

1. grant 없는 상태: 스위처 안 보이고 앱 100% 동일(회귀 없음).
2. grant 후 로그인: 스위처 노출 → "여자친구" 선택 → 홈/포폴/스냅샷/계좌가 그녀 데이터로 전환 + 배너 표시.
3. 관리 모드에서 종목 추가/수정/삭제 → **그녀** holdings에만 반영, 내 것 불변.
4. 쿠키를 임의 userId로 위조 → self 폴백(그녀 외 타인 데이터 접근 불가).
5. 관리 모드에서 회원탈퇴 시도 → 차단.
6. `npm run build` 통과(운영 push 전 풀빌드 필수).

## 11. 영향 범위 (구현 계획용 파일 지도)

**신규**
- `prisma/migrations/*_add_portfolio_access/` (+ `schema.prisma`)
- `lib/portfolio-context.ts` (리졸버)
- `app/actions/portfolio-access-actions.ts` (`setActivePortfolio`)
- `components/dashboard/portfolio-switcher.tsx`, `components/dashboard/managed-banner.tsx`
- `scripts/grant-portfolio-access.ts`

**데이터 경로 → `portfolioUserId`로 교체**
- pages: `app/dashboard/page.tsx`, `portfolio/page.tsx`, `snapshots/page.tsx`,
  `snapshots/[id]/page.tsx`, `simulation/page.tsx`, `accounts/page.tsx`, `settings/page.tsx`(표시값)
- api: `app/api/holdings/route.ts`, `holdings/[id]/route.ts`, `holdings/[id]/transfer/route.ts`,
  `snapshots/route.ts`, `snapshots/chart-data/route.ts`, `snapshots/[id]/route.ts`,
  `accounts/route.ts`, `simulation/route.ts`(data), `user/route.ts`,
  `ai/portfolio/route.ts`(data), `ai/ocr-import/route.ts`(data)
- actions: `app/actions.ts`(`toggleAutoSnapshot`,`updateTargetAsset`), `actions/holding-actions.ts`,
  `actions/cash-actions.ts`, `actions/account-actions.ts`

**신원 경로 → `actorId` 유지(변경 최소/무변경)**
- `app/actions/consent.ts`, `actions/delete-account.ts`(하드 잠금), `actions/admin-actions.ts`,
  `app/auth/consent/page.tsx`, `lib/auth.ts`

**시장 데이터만(소유 스코핑 없음, rate-limit=actor)**
- `app/api/kis/price/route.ts`, `stocks/route.ts`, `stocks/chart/route.ts`, `stocks/history/route.ts`,
  `stocks/search/route.ts`
