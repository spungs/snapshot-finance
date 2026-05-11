/**
 * KIS WebSocket worker — 본인 1명 전용, 맥북 로컬 실행.
 *
 * 책임:
 *   1. KIS REST /oauth2/Approval 로 approval_key 발급
 *   2. KIS WebSocket 연결 (자동 재연결 + ping/pong + 장 외 시간 sleep)
 *   3. DB holdings 합집합을 30초마다 polling → 신규 종목 register, 사라진 종목 unregister
 *   4. 수신 tick → Supabase Realtime channel "stock:{KR|US}:{code}" broadcast (event "tick")
 *      동시에 Upstash Redis stock:price:{code} 도 업데이트 → REST fallback 일관
 *   5. 한국(H0STCNT0) + 미국(HDFSCNT0) 둘 다 지원
 *
 * 실행: npm run worker:dev
 *
 * 환경변수:
 *   필수: KIS_APP_KEY, KIS_APP_SECRET, KIS_MODE
 *   필수: DATABASE_URL (holdings 합집합 조회)
 *   선택: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Realtime broadcast — 없으면 console.log 만)
 *   선택: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (캐시 동기화 — 없으면 skip)
 */

import WebSocket from 'ws'
import { PrismaClient } from '@prisma/client'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'

// ---------------------------------------------------------------------------
// 환경변수 / 상수
// ---------------------------------------------------------------------------
const KIS_REST_BASE = {
    REAL: 'https://openapi.koreainvestment.com:9443',
    VIRTUAL: 'https://openapivts.koreainvestment.com:29443',
} as const
const KIS_WS_URL = {
    REAL: 'ws://ops.koreainvestment.com:21000',
    VIRTUAL: 'ws://ops.koreainvestment.com:31000',
} as const

const APP_KEY = process.env.KIS_APP_KEY
const APP_SECRET = process.env.KIS_APP_SECRET
const MODE = (process.env.KIS_MODE as 'REAL' | 'VIRTUAL') || 'REAL'

if (!APP_KEY || !APP_SECRET) {
    console.error('[kis-ws] KIS_APP_KEY / KIS_APP_SECRET 환경변수 필요')
    process.exit(1)
}

const HOLDINGS_POLL_MS = 30_000          // 보유 종목 합집합 polling
const RECONNECT_BASE_MS = 1_000          // 재연결 초기 백오프
const RECONNECT_MAX_MS = 60_000          // 재연결 최대 백오프
const PRICE_CACHE_TTL = 14_400           // Redis TTL (REST fallback 과 동일 4h)

// 장 시간 (KST). 단순 휴장일 별도 표는 추후 — 우선 평일 + 장중만.
const KR_MARKET_OPEN_KST = { hour: 9, minute: 0 }
const KR_MARKET_CLOSE_KST = { hour: 15, minute: 35 }
const US_MARKET_OPEN_KST = { hour: 22, minute: 30 }  // 서머타임 단순화 — 정확하려면 NYSE 캘린더 별도
const US_MARKET_CLOSE_KST = { hour: 5, minute: 0 }    // 다음날 새벽

// ---------------------------------------------------------------------------
// 의존성 초기화 (env 없으면 graceful skip)
// ---------------------------------------------------------------------------
const prisma = new PrismaClient()

let supabase: SupabaseClient | null = null
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
    )
    console.log('[kis-ws] Supabase Realtime 활성')
} else {
    console.warn('[kis-ws] Supabase env 누락 — broadcast skip (콘솔 로그만)')
}

let redis: Redis | null = null
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    console.log('[kis-ws] Upstash Redis 활성')
}

// ---------------------------------------------------------------------------
// KIS REST — Approval 발급
// ---------------------------------------------------------------------------
async function issueApprovalKey(): Promise<string> {
    const res = await fetch(`${KIS_REST_BASE[MODE]}/oauth2/Approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            appkey: APP_KEY,
            secretkey: APP_SECRET,
        }),
    })
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`/oauth2/Approval ${res.status}: ${text}`)
    }
    const json = (await res.json()) as { approval_key?: string }
    if (!json.approval_key) throw new Error(`approval_key 누락: ${JSON.stringify(json)}`)
    return json.approval_key
}

// ---------------------------------------------------------------------------
// 시장 정규화 + 장 시간 판단
// ---------------------------------------------------------------------------
type MarketKind = 'KR' | 'US'

function normalizeMarket(raw: string | null | undefined): MarketKind | null {
    if (!raw) return null
    const m = raw.toUpperCase()
    if (m === 'KOSPI' || m === 'KOSDAQ' || m === 'KS' || m === 'KQ' || m === 'KR') return 'KR'
    if (m === 'US' || m === 'NASD' || m === 'NAS' || m === 'NYSE' || m === 'NYS' || m === 'AMEX' || m === 'AMS') return 'US'
    return null
}

function nowInKstParts() {
    const now = new Date()
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
    const kst = new Date(utcMs + 9 * 3600_000)
    return {
        weekday: kst.getUTCDay(),  // 0=Sun ... 6=Sat
        hour: kst.getUTCHours(),
        minute: kst.getUTCMinutes(),
        minuteOfDay: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
    }
}

function isMarketOpen(market: MarketKind): boolean {
    const { weekday, minuteOfDay } = nowInKstParts()
    // 평일만 (한국 기준 토/일 둘 다 휴장. 미국은 KST 기준 화-토 오전이 거래일)
    if (market === 'KR') {
        if (weekday === 0 || weekday === 6) return false
        const open = KR_MARKET_OPEN_KST.hour * 60 + KR_MARKET_OPEN_KST.minute
        const close = KR_MARKET_CLOSE_KST.hour * 60 + KR_MARKET_CLOSE_KST.minute
        return minuteOfDay >= open && minuteOfDay <= close
    }
    // US: KST 22:30 ~ 익일 05:00 (DST 무시 단순화). 월요일 22:30 ~ 토 05:00 사이.
    if (weekday === 0) return false  // 일요일은 항상 닫힘
    if (weekday === 6) return minuteOfDay < US_MARKET_CLOSE_KST.hour * 60  // 토요일 새벽까지
    const usOpen = US_MARKET_OPEN_KST.hour * 60 + US_MARKET_OPEN_KST.minute
    const usCloseNext = US_MARKET_CLOSE_KST.hour * 60 + US_MARKET_CLOSE_KST.minute
    return minuteOfDay >= usOpen || minuteOfDay < usCloseNext
}

function anyMarketOpen(): boolean {
    return isMarketOpen('KR') || isMarketOpen('US')
}

// ---------------------------------------------------------------------------
// holdings 합집합 polling
// ---------------------------------------------------------------------------
interface Subscription {
    code: string
    market: MarketKind
    trId: 'H0STCNT0' | 'HDFSCNT0'
    trKey: string  // KR: 단순 코드, US: "D{prefix}{symbol}" 형태 (예: DNASAAPL)
}

function buildTrKey(code: string, market: MarketKind, rawMarket: string | null): string {
    if (market === 'KR') return code
    // US 의 경우 HDFSCNT0 tr_key 는 "D{거래소코드3자리}{종목심볼}" — 예: DNAS + AAPL
    // KIS 문서: NAS(나스닥) → DNAS, NYS(NYSE) → DNYS, AMS(AMEX) → DAMS
    const ex = (rawMarket || '').toUpperCase()
    let prefix = 'DNAS'  // 기본
    if (ex === 'NYS' || ex === 'NYSE') prefix = 'DNYS'
    else if (ex === 'AMS' || ex === 'AMEX') prefix = 'DAMS'
    return `${prefix}${code}`
}

async function fetchTargetSubscriptions(): Promise<Subscription[]> {
    const rows = await prisma.holding.findMany({
        select: { stock: { select: { stockCode: true, market: true } } },
        distinct: ['stockId'],
    })
    const seen = new Set<string>()
    const subs: Subscription[] = []
    for (const r of rows) {
        const market = normalizeMarket(r.stock.market)
        if (!market) continue
        const trId: 'H0STCNT0' | 'HDFSCNT0' = market === 'KR' ? 'H0STCNT0' : 'HDFSCNT0'
        const trKey = buildTrKey(r.stock.stockCode, market, r.stock.market)
        const key = `${trId}:${trKey}`
        if (seen.has(key)) continue
        seen.add(key)
        subs.push({ code: r.stock.stockCode, market, trId, trKey })
    }
    return subs
}

// ---------------------------------------------------------------------------
// 메시지 파싱
// ---------------------------------------------------------------------------
interface ParsedTick {
    code: string
    market: MarketKind
    price: number
    change: number
    changeRate: number
    time: string
}

function parseKrTick(payload: string): ParsedTick | null {
    const f = payload.split('^')
    if (f.length < 6) return null
    const price = Number(f[2])
    if (!Number.isFinite(price)) return null
    return {
        code: f[0],
        market: 'KR',
        time: f[1],
        price,
        change: Number(f[4]) || 0,
        changeRate: Number(f[5]) || 0,
    }
}

function parseUsTick(payload: string): ParsedTick | null {
    // HDFSCNT0 payload 필드 (공식 문서 기준):
    //   0:실시간종목코드(예: DNASAAPL) 1:종목코드 2:현지영업일자 3:현지시각
    //   ... 11:현재가 12:전일대비부호 13:전일대비 14:등락율 ...
    const f = payload.split('^')
    if (f.length < 15) return null
    const price = Number(f[11])
    if (!Number.isFinite(price)) return null
    return {
        code: f[1] || f[0].replace(/^D[A-Z]{3}/, ''),
        market: 'US',
        time: f[3] || '',
        price,
        change: Number(f[13]) || 0,
        changeRate: Number(f[14]) || 0,
    }
}

// ---------------------------------------------------------------------------
// 가격 push — Supabase Realtime + Redis 동시
// ---------------------------------------------------------------------------
async function pushTick(t: ParsedTick) {
    const payload = {
        code: t.code,
        market: t.market,
        price: t.price,
        change: t.change,
        changeRate: t.changeRate,
        time: t.time,
        ts: Date.now(),
    }

    // Realtime broadcast (env 없으면 skip)
    if (supabase) {
        const channelName = `stock:${t.market}:${t.code}`
        try {
            const ch = supabase.channel(channelName)
            await ch.subscribe()
            await ch.send({ type: 'broadcast', event: 'tick', payload })
            // 채널 reuse 하려면 유지가 좋으나 broadcast 만 보내고 즉시 unsubscribe 도 OK
            // 단순화: 매 tick 마다 subscribe/send/unsubscribe 는 비싸므로 cache 한다
            channelCache.set(channelName, ch)
        } catch (e) {
            console.warn(`[push] supabase ${channelName} failed:`, (e as Error).message)
        }
    }

    // Redis 캐시 (env 없으면 skip) — REST fallback 경로와 일관 (stock:price:{code})
    if (redis) {
        try {
            await redis.set(
                `stock:price:${t.code}`,
                {
                    price: t.price,
                    currency: t.market === 'KR' ? 'KRW' : 'USD',
                    change: t.change,
                    changeRate: t.changeRate,
                    updatedAt: new Date().toISOString(),
                },
                { ex: PRICE_CACHE_TTL },
            )
        } catch (e) {
            console.warn(`[push] redis ${t.code} failed:`, (e as Error).message)
        }
    }
}

// 종목별 channel 캐시 — 재사용해 매 tick subscribe overhead 회피
const channelCache = new Map<string, ReturnType<NonNullable<typeof supabase>['channel']>>()

// ---------------------------------------------------------------------------
// WebSocket 세션
// ---------------------------------------------------------------------------
class KisSession {
    private ws: WebSocket | null = null
    private approvalKey: string | null = null
    private subscribed = new Map<string, Subscription>()  // key = trId:trKey
    private reconnectMs = RECONNECT_BASE_MS
    private pollHandle: NodeJS.Timeout | null = null
    private marketCheckHandle: NodeJS.Timeout | null = null
    private shouldRun = true

    async start() {
        // 장 외 시간이면 connect 안 함 — 5분 간격으로 재체크
        if (!anyMarketOpen()) {
            console.log('[kis-ws] 장 외 시간 — 5분 후 재체크')
            this.marketCheckHandle = setTimeout(() => this.start(), 5 * 60_000)
            return
        }

        try {
            this.approvalKey = await issueApprovalKey()
            console.log('[kis-ws] approval_key 발급')
        } catch (e) {
            console.error('[kis-ws] approval 발급 실패:', (e as Error).message)
            this.scheduleReconnect()
            return
        }

        this.connect()
    }

    private connect() {
        const url = KIS_WS_URL[MODE]
        console.log(`[kis-ws] connecting ${url}`)
        this.ws = new WebSocket(url)

        this.ws.on('open', () => {
            console.log('[kis-ws] connected')
            this.reconnectMs = RECONNECT_BASE_MS
            // 첫 구독 동기화 + 주기 polling 시작
            void this.syncSubscriptions()
            this.pollHandle = setInterval(() => void this.syncSubscriptions(), HOLDINGS_POLL_MS)
            // 장 외 시간 자동 전환 체크
            this.marketCheckHandle = setInterval(() => {
                if (!anyMarketOpen()) {
                    console.log('[kis-ws] 장 마감 감지 — 연결 종료, 5분 후 재체크')
                    this.shutdownConnection(false)
                    this.marketCheckHandle = setTimeout(() => this.start(), 5 * 60_000)
                }
            }, 60_000)
        })

        this.ws.on('message', (raw) => this.handleMessage(raw.toString()))

        this.ws.on('error', (e) => console.error('[kis-ws] error:', e.message))

        this.ws.on('close', (code, reason) => {
            console.warn(`[kis-ws] closed code=${code} reason=${reason.toString().slice(0, 100)}`)
            this.clearTimers()
            if (this.shouldRun) this.scheduleReconnect()
        })
    }

    private handleMessage(str: string) {
        // 등록 응답 / 에러 / PINGPONG 은 JSON
        if (str.startsWith('{')) {
            try {
                const obj = JSON.parse(str)
                if (obj?.header?.tr_id === 'PINGPONG') {
                    this.ws?.send(str)
                    return
                }
                const tr = obj?.header?.tr_id
                const rt = obj?.body?.rt_cd
                const msg = obj?.body?.msg1
                if (rt !== '0') console.warn(`[kis-ws] ctrl tr=${tr} rt=${rt} msg=${msg}`)
            } catch { /* ignore */ }
            return
        }
        // 실시간 tick: enc|TR_ID|count|payload(^구분)
        const segs = str.split('|')
        if (segs.length < 4) return
        const trId = segs[1]
        const payload = segs[3]
        let tick: ParsedTick | null = null
        if (trId === 'H0STCNT0') tick = parseKrTick(payload)
        else if (trId === 'HDFSCNT0') tick = parseUsTick(payload)
        if (!tick) return
        // push (fire and forget)
        void pushTick(tick)
    }

    private async syncSubscriptions() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
        if (!this.approvalKey) return
        try {
            const targets = await fetchTargetSubscriptions()
            const targetKeys = new Set(targets.map((s) => `${s.trId}:${s.trKey}`))
            // 새로 추가할 것
            for (const sub of targets) {
                const key = `${sub.trId}:${sub.trKey}`
                if (this.subscribed.has(key)) continue
                this.sendFrame(sub.trId, sub.trKey, '1')
                this.subscribed.set(key, sub)
                console.log(`[kis-ws] + register ${key}`)
            }
            // 제거할 것
            for (const [key, sub] of this.subscribed) {
                if (targetKeys.has(key)) continue
                this.sendFrame(sub.trId, sub.trKey, '2')
                this.subscribed.delete(key)
                console.log(`[kis-ws] - unregister ${key}`)
            }
        } catch (e) {
            console.warn('[kis-ws] sync failed:', (e as Error).message)
        }
    }

    private sendFrame(trId: string, trKey: string, trType: '1' | '2') {
        if (!this.ws || !this.approvalKey) return
        this.ws.send(JSON.stringify({
            header: {
                approval_key: this.approvalKey,
                custtype: 'P',
                tr_type: trType,
                'content-type': 'utf-8',
            },
            body: { input: { tr_id: trId, tr_key: trKey } },
        }))
    }

    private scheduleReconnect() {
        const delay = this.reconnectMs
        this.reconnectMs = Math.min(this.reconnectMs * 2, RECONNECT_MAX_MS)
        console.log(`[kis-ws] reconnect in ${delay}ms`)
        setTimeout(() => { if (this.shouldRun) void this.start() }, delay)
    }

    private clearTimers() {
        if (this.pollHandle) { clearInterval(this.pollHandle); this.pollHandle = null }
        if (this.marketCheckHandle) {
            clearInterval(this.marketCheckHandle as NodeJS.Timeout)
            clearTimeout(this.marketCheckHandle as NodeJS.Timeout)
            this.marketCheckHandle = null
        }
    }

    private shutdownConnection(stop: boolean) {
        this.clearTimers()
        if (stop) this.shouldRun = false
        try { this.ws?.close() } catch { /* ignore */ }
        this.ws = null
        this.subscribed.clear()
    }

    shutdown() {
        console.log('[kis-ws] shutdown')
        this.shutdownConnection(true)
    }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const session = new KisSession()
void session.start()

const onSignal = async () => {
    session.shutdown()
    await prisma.$disconnect().catch(() => undefined)
    process.exit(0)
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)
