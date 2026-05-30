# 매일 아침 포트폴리오 브리핑 자동화 — 설계

> 최종 업데이트: 2026-05-30

## 1. 배경 / 목표

보유탭의 "공유하기" 기능을 매일 아침 자동화하고 싶다는 요청에서 출발.

- **오해 해소:** 공유 기능(`components/dashboard/portfolio-share.tsx`)은 `html-to-image`로 카드를 PNG로 만들어 `navigator.share`로 넘기는 **브라우저 전용** 동작이라 헤드리스/스케줄 환경에서 실행 불가. 그러나 그 이미지는 결국 DB에 이미 있는 보유 데이터의 시각화일 뿐 — 분석 에이전트에 필요한 건 **이미지가 아니라 그 데이터**.
- **목표:** 매일 아침 **08:00 KST**에 오너 본인 포트폴리오를 분석해 텔레그램으로 받는다.
  1. 종목별 (간밤/전일) 변동률
  2. 종목별 뉴스 조사 (웹 검색)
  3. 리밸런싱 추천/제안
- **범위:** 개인 자동화 (오너 1인). 제품 기능 아님.

## 2. 비목표 (YAGNI)

- 전체 사용자 대상 제품 기능 ❌
- 앱 UI 변경 ❌
- 양방향 대화/수신 ❌ — **단방향 푸시만**
- 앱에 뉴스 기능 재구축 ❌ — 뉴스 조사는 루틴의 웹 검색으로 대체

## 3. 핵심 설계 판단

| 결정 | 선택 | 이유 |
|---|---|---|
| 실행 위치 | **Claude 원격 루틴 (schedule)** | 맥 전원과 무관하게 08:00 정시 실행. 무거운 뉴스 조사·리밸런싱 추론은 에이전트가 가장 잘함 |
| 데이터 접근 | **앱 read 엔드포인트 (토큰 게이트)** | DB 크리덴셜을 루틴에 노출하지 않음 |
| 전달 채널 | **텔레그램 Bot API `sendMessage`** | stateless POST 1회 → 상시 연결 없음 → idle 끊김 문제 원천 무관 |
| 텔레그램 전송 주체 | **루틴이 직접 curl** | 앱 코드 추가 0. 봇 토큰·chat_id는 루틴 설정에 보관 |

> **참고:** 텔레그램 **MCP**의 idle 5분 끊김·long-poll 행은 모두 "메시지 **수신**용 상시 롱폴 연결"에서 발생. 우리는 **발신**만 하므로 해당 없음. (근거: claude-code #36427, claude-plugins-official #788/#917/#1378, openclaw #48029/#56061)

## 4. 아키텍처

```
[Claude 원격 루틴 @ 매일 08:00 KST]
   │ 1) GET  {APP_BASE_URL}/api/portfolio/daily-brief   (Bearer DAILY_BRIEF_TOKEN)
   │        → 보유·변동률·요약 JSON
   │ 2) WebSearch (종목별 간밤/오늘 뉴스·이슈 조사)
   │ 3) 리포트 작성 (아래 포맷)
   └ 4) curl POST api.telegram.org/bot{TOKEN}/sendMessage  → 텔레그램 수신
```

루틴이 보유하는 시크릿: `APP_BASE_URL`, `DAILY_BRIEF_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## 5. 컴포넌트

### C1. `GET /api/portfolio/daily-brief` (신규, ~50줄)

- **인증:** `Authorization: Bearer ${DAILY_BRIEF_TOKEN}` (기존 `CRON_SECRET` 패턴 동일). 불일치 시 401.
- **대상:** `BRIEF_USER_EMAIL` 사용자 1명의 `Holding`.
- **변동률:** 기존 `kisClient.getCurrentPrice()` / Redis 캐시의 `changeRate` 재사용 (LSE = 0/`null` → 응답에서 `null`).
- **응답 JSON (예):**
  ```json
  {
    "asOf": "2026-05-30T23:00:00Z",
    "summary": { "totalValue": 0, "totalCost": 0, "totalProfit": 0,
                 "totalProfitRate": 0, "cashBalance": 0, "exchangeRate": 0 },
    "holdings": [
      { "stockCode": "AAPL", "stockName": "애플", "market": "NAS",
        "quantity": 0, "averagePrice": 0, "currentPrice": 0, "currency": "USD",
        "changeRate": 2.1, "currentValue": 0, "profit": 0, "profitRate": 0, "weight": 0 }
    ]
  }
  ```
- **시크릿 위생 주의:** 토큰·Redis는 **핸들러 내부**에서 `process.env`로 읽기. 모듈 top-level에서 평가 금지 (Vercel Sensitive env 빌드 미복호화 함정 — `new Redis()` 크래시 사례).

### C2. Claude 원격 루틴 (`schedule` 스킬)

- **스케줄:** cron `0 23 * * *` UTC = **08:00 KST**. (요일: 매일 또는 **화~토** 권장 — 아래 §6 참고)
- **절차:** §4의 1~4단계.
- **실패 처리:**
  - 엔드포인트 실패(시세 API 다운 등) → 가진 데이터만으로 축약 전송 + "일부 누락" 명시.
  - 보유 0종목 / 주말 무거래 → 짧은 안내만.

### C3. 리포트 포맷 (텔레그램 메시지)

```
📊 5/30 아침 브리핑 — {이름} 포트폴리오
총자산 ₩XX,XXX,XXX (전일대비 +1.2% · +₩XXX,XXX)

• AAPL 애플   +2.1% ▲  — {핵심 뉴스 한 줄}
• 삼성전자    -0.8% ▼  — {핵심 뉴스 한 줄}
  …
🔁 리밸런싱 제안
 - {비중·수익률 기반 제안 1~2개}

(US 간밤 마감 / KR 전일 종가 기준)
```

## 6. 데이터 의미 (08:00 KST 기준)

- **US 종목:** 간밤 미국 마감 결과가 캐시에 신선 (US 워밍 cron이 ~07:00 KST까지 갱신) → "간밤 변동률 + 뉴스".
- **KR 종목:** 장 시작(09:00) 전 → "전 거래일 종가 변동률 + 오늘 전망 뉴스".
- 리포트 하단에 기준 시점 명시.
- **월요일 주의:** 월요일 08:00 KST는 US 데이터가 금요일 마감(2일 전)일 수 있음 → 화~토 스케줄 권장.

## 7. 1회 셋업 (사용자 수행)

1. BotFather로 텔레그램 봇 생성 → `TELEGRAM_BOT_TOKEN`.
2. `chat_id` 확보 (봇에 아무 메시지 전송 후 `getUpdates` 1회, 또는 `@userinfobot`).
3. Vercel env 추가: `DAILY_BRIEF_TOKEN`(랜덤 문자열), `BRIEF_USER_EMAIL`(오너 이메일).
4. 루틴 등록 시 4개 값 입력: `APP_BASE_URL`, `DAILY_BRIEF_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## 8. 테스트 / 검증

- **엔드포인트:** `curl -H "Authorization: Bearer $TOKEN" .../api/portfolio/daily-brief` → JSON 확인. 잘못된 토큰 → 401.
- **루틴:** 수동 1회 실행(run now) → 텔레그램 수신 확인.
- **배포 전:** `npm run build` 풀빌드 통과 후 push (운영 push 전 풀빌드 규칙).

## 9. 미해결 / 주의

- `changeRate`가 LSE=0, 일부 종목 `null` 가능 → 리포트에서 "변동률 N/A" 표기.
- 종목 수 많으면 루틴의 웹검색·추론 비용↑ (개인용 1일 1회라 무시 가능).
- 텔레그램 메시지 길이 한도(4096자) — 종목 매우 많으면 분할 전송 고려.
```
