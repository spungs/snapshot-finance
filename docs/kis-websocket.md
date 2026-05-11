# KIS WebSocket 실시간 시세 통합

본인 1명 전용 가이드 — 맥북 로컬에서 KIS WebSocket worker 를 항상 가동해 실시간 시세를 받는다.

## 아키텍처

```
맥북 (worker/kis-ws.ts) ─ WebSocket ─► KIS Server
       │
       ├─► Supabase Realtime broadcast (stock:{KR|US}:{code}) ─► Next.js (Vercel) 클라이언트
       └─► Upstash Redis (stock:price:{code}) ─► REST cron fallback 경로 일관성
```

- 워커가 죽으면 클라이언트는 자동으로 기존 REST + Redis 4h 캐시로 fallback
- 장 마감/주말엔 워커가 WebSocket 자동 종료, 다시 장 열리면 자동 재연결

## 1. Supabase Realtime 환경변수 설정

1. https://supabase.com/dashboard/project/<프로젝트>/settings/api 열기
2. 아래 3개 키 복사
3. `.env.development.local` 과 운영(Vercel Project Settings → Environment Variables) 양쪽에 추가

```bash
# Supabase Realtime (실시간 시세 broadcast)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...     # 클라이언트가 수신 (NEXT_PUBLIC_ prefix 필수)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...          # 워커 전용 — 절대 클라이언트에 노출 금지
```

> **주의**: `SERVICE_ROLE_KEY` 는 NEXT_PUBLIC_ 접두사 없이 — Vercel 에서 server-only 환경변수로 설정.

## 2. 워커 로컬 실행

```bash
# 일회성 실행 (개발 / 디버깅)
npm run worker:dev

# 정상 로그 예시 (장 외 시간):
# [kis-ws] Supabase Realtime 활성
# [kis-ws] Upstash Redis 활성
# [kis-ws] 장 외 시간 — 5분 후 재체크

# 장중 (KR 09:00-15:35, US KST 22:30-05:00):
# [kis-ws] connecting ws://ops.koreainvestment.com:21000
# [kis-ws] connected
# [kis-ws] + register H0STCNT0:005930
# (tick 들은 push 만 — 콘솔 로그는 ctrl/error 만)
```

## 3. macOS launchd 자동 시작 (로그인 시 자동, 슬립 시에도 가동)

```bash
# 설치 (1회)
./scripts/install-worker.sh

# 동작 확인
tail -f ~/Library/Logs/snapshot-kis-ws.log

# 제거
./scripts/uninstall-worker.sh
```

설치 후 동작:
- 로그인 시 자동 시작
- `caffeinate -i` 로 시스템 슬립 방지 (디스플레이는 꺼져도 OK)
- 충돌 시 30초 후 자동 재시작
- 로그: `~/Library/Logs/snapshot-kis-ws.{log,err.log}`

## 4. 클라이언트 동작 검증

1. 워커 가동 + 장중 진입
2. 브라우저에서 `/dashboard/portfolio` 열기
3. KOSPI/KOSDAQ 종목의 가격이 1-3초 간격으로 실시간 변동
4. 미국 종목은 KST 22:30 이후 미국 장 열리면 동일하게 동작
5. 환경변수 누락 시 → ticks 빈 Map → 기존 SSR currentPrice 그대로 (graceful fallback)

## 5. 트러블슈팅

| 증상 | 원인 / 조치 |
|------|------------|
| 로그에 `Supabase env 누락` | `.env.development.local` 에 `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 추가 후 재시작 |
| `/oauth2/Approval 401` | `KIS_APP_KEY` / `KIS_APP_SECRET` 잘못. 모의 모드면 `KIS_MODE=VIRTUAL` 인지 확인 |
| `ECONNREFUSED` / `ETIMEDOUT` | 회사·공공 WiFi 가 port 21000 차단. 다른 네트워크 시도 |
| 등록 응답 `rt_cd != 0` | KIS 계정 권한/한도 — 메시지 (`msg1`) 확인 |
| 클라이언트에 가격 안 옴 | (1) 워커 가동 확인 (2) 클라이언트 console 에 supabase 에러 (3) Supabase 대시보드 Realtime → Channels 에서 broadcast 통계 확인 |
| 좀비 세션 | 워커 재시작 (`launchctl unload && launchctl load`) — KIS 서버측 세션 정리는 자동 |
| 가격 변동 너무 잦음 | 정상. 호가/체결 단위로 초당 다수. UI debounce 는 follow-up 검토 |

## 6. 한도/제약

- KIS 개인 계좌 1세션당 체결+호가 **약 41 종목** (공식 ~20, 실측 41)
- 41개 초과 시 다중 KIS 계좌 풀 → 본 안에서는 단일 계좌 가정. 보유 종목 ~40개까지 검증된 범위
- 휴장일 (한국/미국 공휴일) 캘린더 정확 처리는 follow-up

## 7. Phase 진행 기록

- [x] Phase 1: PoC 단일 종목 콘솔 로그
- [x] Phase 2: Supabase Realtime broadcast + 클라이언트 hook
- [x] Phase 3: 다종목 동적 구독 (holdings 합집합 30s polling)
- [x] Phase 4: useStockTicks hook + holdings 자동 갱신
- [x] Phase 5: 자동 재연결 + ping/pong + 장 외 시간 sleep
- [x] Phase 6: 해외(HDFSCNT0) 통합
- [x] Phase 7: launchd 자동시작 + caffeinate
- [x] Phase 8: launchd 로그 파일

## 8. 향후 개선 (follow-up)

- 가격 변동 시 카드 색상 1회 flash (UX)
- 휴장일 정확한 캘린더 (한국 거래소 휴장일/미국 NYSE 휴장일)
- 다중 KIS 계좌 풀 (40 종목 초과 시)
- 워커 로그 회전 (newsyslog 또는 자체 회전)
- 가격 이상치 (직전 ±20%) 알림
- 미국 종목 서머타임(DST) 처리 정확화
