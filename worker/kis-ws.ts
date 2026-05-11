/**
 * KIS WebSocket worker (Phase 1 PoC)
 *
 * 실시간 시세 수신 → 콘솔 로그.
 * 본인 1명 전용으로 맥북에서 직접 실행. Vercel 빌드 제외.
 *
 * 실행:
 *   npm run worker:dev
 *
 * 환경변수 (.env.development.local 또는 .env):
 *   KIS_APP_KEY, KIS_APP_SECRET, KIS_MODE (REAL | VIRTUAL)
 *
 * Phase 1 범위:
 *   - /oauth2/Approval 로 approval_key 발급
 *   - WebSocket 연결 (실전 또는 모의)
 *   - 단일 종목(삼성전자 005930) 체결가 구독 (H0STCNT0)
 *   - 메시지를 콘솔에 그대로 출력
 *
 * Phase 2 이후 추가 예정: Supabase Realtime broadcast, 다종목 동적 구독, 재연결, ping/pong.
 */

import WebSocket from 'ws'

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
    console.error('[kis-ws] KIS_APP_KEY / KIS_APP_SECRET 환경변수가 필요합니다.')
    process.exit(1)
}

const POC_SYMBOL = '005930' // 삼성전자

async function issueApprovalKey(): Promise<string> {
    const url = `${KIS_REST_BASE[MODE]}/oauth2/Approval`
    const res = await fetch(url, {
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
        throw new Error(`[kis-ws] /oauth2/Approval ${res.status}: ${text}`)
    }
    const json = (await res.json()) as { approval_key?: string }
    if (!json.approval_key) {
        throw new Error(`[kis-ws] approval_key 누락: ${JSON.stringify(json)}`)
    }
    return json.approval_key
}

function buildSubscribeFrame(approvalKey: string, trId: string, trKey: string) {
    return JSON.stringify({
        header: {
            approval_key: approvalKey,
            custtype: 'P',
            tr_type: '1',
            'content-type': 'utf-8',
        },
        body: {
            input: { tr_id: trId, tr_key: trKey },
        },
    })
}

function parseTickFrame(raw: string) {
    // 실시간 체결 응답 포맷:
    //   0|H0STCNT0|001|005930^164832^61500^...
    //   [0]암호화여부 | [1]TR_ID | [2]데이터건수 | [3]필드(^구분)
    const segs = raw.split('|')
    if (segs.length < 4) return null
    const [enc, trId, count, payload] = segs
    if (trId !== 'H0STCNT0') return null
    const fields = payload.split('^')
    // H0STCNT0 필드 순서 (공식 문서 기준 일부):
    //   0:종목코드 1:체결시간(HHMMSS) 2:현재가 3:전일대비 4:전일대비부호 5:전일대비율 ...
    return {
        enc,
        count: Number(count),
        code: fields[0],
        time: fields[1],
        price: Number(fields[2]),
        change: Number(fields[3]),
        sign: fields[4],
        changeRate: Number(fields[5]),
    }
}

async function main() {
    console.log(`[kis-ws] start mode=${MODE} symbol=${POC_SYMBOL}`)
    const approvalKey = await issueApprovalKey()
    console.log(`[kis-ws] approval_key 발급 완료 (length=${approvalKey.length})`)

    const ws = new WebSocket(KIS_WS_URL[MODE])

    ws.on('open', () => {
        console.log(`[kis-ws] connected ${KIS_WS_URL[MODE]}`)
        const frame = buildSubscribeFrame(approvalKey, 'H0STCNT0', POC_SYMBOL)
        ws.send(frame)
        console.log(`[kis-ws] subscribed H0STCNT0:${POC_SYMBOL}`)
    })

    ws.on('message', (raw) => {
        const str = raw.toString()
        // 첫 등록 응답 + ping/pong 등은 JSON
        if (str.startsWith('{')) {
            try {
                const obj = JSON.parse(str)
                const tr = obj?.header?.tr_id ?? '?'
                const code = obj?.body?.rt_cd
                const msg = obj?.body?.msg1
                console.log(`[kis-ws] ctrl tr=${tr} rt_cd=${code} msg=${msg}`)
                // PINGPONG 응답
                if (obj?.header?.tr_id === 'PINGPONG') {
                    ws.send(str)
                }
            } catch {
                console.log(`[kis-ws] ctrl (non-json): ${str}`)
            }
            return
        }
        // 실시간 tick
        const tick = parseTickFrame(str)
        if (tick) {
            console.log(
                `[tick] ${tick.code} ${tick.time} price=${tick.price.toLocaleString()} (${tick.sign === '2' || tick.sign === '5' ? '+' : tick.sign === '1' || tick.sign === '4' ? '-' : ''}${tick.change} ${tick.changeRate}%)`
            )
        } else {
            console.log(`[raw] ${str.slice(0, 200)}`)
        }
    })

    ws.on('error', (err) => console.error('[kis-ws] error:', err))
    ws.on('close', (code, reason) =>
        console.warn(`[kis-ws] closed code=${code} reason=${reason.toString()}`)
    )

    // Graceful shutdown
    const shutdown = () => {
        console.log('[kis-ws] shutdown')
        try { ws.close() } catch { /* ignore */ }
        process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

main().catch((e) => {
    console.error('[kis-ws] fatal:', e)
    process.exit(1)
})
