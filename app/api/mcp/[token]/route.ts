import { createHash, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { prisma } from '@/lib/prisma'
import {
    McpToolError,
    getPortfolio,
    searchStocks,
    recordBuy,
    recordSell,
    setHolding,
    deleteHolding,
    setCash,
} from '@/lib/mcp/portfolio-service'

/**
 * Claude 커스텀 커넥터용 원격 MCP 서버 (Streamable HTTP, stateless).
 *
 * URL: https://<host>/api/mcp/<MCP_ACCESS_TOKEN>
 * - 개인 전용: 토큰이 맞으면 MCP_OWNER_EMAIL 계정의 포트폴리오만 다룬다.
 * - 토큰은 URL path 에 담는다 — claude.ai 커넥터에 커스텀 헤더를 넣을 수 없기 때문.
 *   (Authorization: Bearer <token> 헤더도 함께 허용 — Claude Code 등 헤더를 지원하는 클라이언트용)
 * - 환경변수가 없으면 엔드포인트 자체가 404 — 기능 비활성 상태가 기본값.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_TOKEN_LENGTH = 32

function sha256(s: string) {
    return createHash('sha256').update(s).digest()
}

/** 길이 노출 없이 상수 시간 비교 (양쪽을 해시해 길이를 맞춘다). */
function tokenMatches(provided: string | undefined, expected: string) {
    if (!provided) return false
    return timingSafeEqual(sha256(provided), sha256(expected))
}

function notFound() {
    return new Response('Not Found', { status: 404 })
}

async function resolveOwnerId(): Promise<string | null> {
    const email = process.env.MCP_OWNER_EMAIL?.trim()
    if (!email) return null
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, deletedAt: true } })
    return user && !user.deletedAt ? user.id : null
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
    try {
        const data = await fn()
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    } catch (error) {
        if (error instanceof McpToolError) {
            return { content: [{ type: 'text', text: error.message }], isError: true }
        }
        console.error('[mcp] tool failed:', error)
        return { content: [{ type: 'text', text: '서버 오류로 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }], isError: true }
    }
}

function buildServer(userId: string) {
    const server = new McpServer(
        { name: 'snapshot-finance', version: '1.0.0' },
        {
            instructions: [
                'Snapshot Finance 개인 포트폴리오(보유 종목·예수금) 기록 도구입니다. 실제 주문은 하지 않고 기록만 바꿉니다.',
                '- 변경 전에 get_portfolio 로 현재 상태를 확인하세요.',
                '- 종목은 반드시 search_stock 으로 stockCode 를 확인한 뒤 매수/매도 도구에 넘기세요. 후보가 여러 개면 사용자에게 물어보세요.',
                '- 추가 매수는 record_buy(가중평균 자동 계산), 일부/전량 매도는 record_sell 을 쓰세요. set_holding 은 증권사 값과 맞추는 정정용입니다.',
                '- 같은 종목이 여러 계좌에 있으면 accountName 을 지정하세요.',
                '- 예수금은 매수/매도로 자동 변경되지 않습니다. 사용자가 원하면 set_cash 로 갱신하세요.',
                '- 변경 후에는 before/after 값을 사용자에게 짧게 보고하세요.',
            ].join('\n'),
        },
    )

    server.registerTool(
        'get_portfolio',
        {
            title: '포트폴리오 조회',
            description: '계좌 목록, 보유 종목(holdingId·수량·평단가·현재가·수익률), 예수금, 총자산 요약을 반환합니다.',
            inputSchema: {},
            annotations: { readOnlyHint: true },
        },
        async () => run(() => getPortfolio(userId)),
    )

    server.registerTool(
        'search_stock',
        {
            title: '종목 검색',
            description: '종목명(한글/영문) 또는 티커로 종목 마스터를 검색해 stockCode·시장·통화 후보를 반환합니다.',
            inputSchema: { query: z.string().min(1).max(100).describe('예: "삼성전자", "엔비디아", "NVDA", "005930"') },
            annotations: { readOnlyHint: true },
        },
        async ({ query }) => run(() => searchStocks(query)),
    )

    server.registerTool(
        'record_buy',
        {
            title: '매수 기록',
            description: '매수(신규·추가매수)를 기록합니다. 이미 보유 중이면 평단가와(USD면) 매입환율을 가중평균으로 합산합니다.',
            inputSchema: {
                stockCode: z.string().min(1).max(20).describe('search_stock 으로 확인한 stockCode'),
                quantity: z.number().int().positive().describe('매수 수량(주)'),
                price: z.number().positive().describe('1주당 체결가 (KRW 종목은 원, USD 종목은 달러)'),
                accountName: z.string().max(50).optional().describe('증권 계좌 이름. 계좌가 여러 개면 지정'),
                exchangeRate: z.number().positive().optional().describe('USD 종목의 매수 시 환율(원/달러). 생략 시 현재 환율'),
            },
            annotations: { destructiveHint: false, idempotentHint: false },
        },
        async (input) => run(() => recordBuy(userId, input)),
    )

    server.registerTool(
        'record_sell',
        {
            title: '매도 기록',
            description: '매도를 기록합니다. 평단가는 유지하고 수량만 줄이며, 0주가 되면 보유 목록에서 삭제합니다.',
            inputSchema: {
                stockCode: z.string().min(1).max(20).describe('search_stock 또는 get_portfolio 로 확인한 stockCode'),
                quantity: z.number().int().positive().describe('매도 수량(주)'),
                accountName: z.string().max(50).optional().describe('같은 종목이 여러 계좌에 있으면 필수'),
                price: z.number().positive().optional().describe('1주당 매도가 — 실현손익 계산용(저장 안 함)'),
            },
            annotations: { destructiveHint: true, idempotentHint: false },
        },
        async (input) => run(() => recordSell(userId, input)),
    )

    server.registerTool(
        'set_holding',
        {
            title: '보유 종목 정정',
            description: '보유 종목의 수량·평단가·매입환율을 지정한 값으로 직접 덮어씁니다 (증권사 앱 값과 맞출 때).',
            inputSchema: {
                holdingId: z.string().min(1).max(40).describe('get_portfolio 의 holdingId'),
                quantity: z.number().int().positive().optional(),
                averagePrice: z.number().positive().optional(),
                purchaseRate: z.number().positive().optional().describe('USD 종목 매입 환율'),
            },
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async (input) => run(() => setHolding(userId, input)),
    )

    server.registerTool(
        'delete_holding',
        {
            title: '보유 종목 삭제',
            description: '보유 종목 행을 삭제합니다. 매도 기록이라면 record_sell 을 우선 사용하세요.',
            inputSchema: { holdingId: z.string().min(1).max(40).describe('get_portfolio 의 holdingId') },
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ holdingId }) => run(() => deleteHolding(userId, holdingId)),
    )

    server.registerTool(
        'set_cash',
        {
            title: '예수금 설정',
            description: '예수금 라벨(계좌명) 하나의 금액을 원화로 설정합니다. 없는 라벨이면 새로 추가합니다.',
            inputSchema: {
                label: z.string().min(1).max(50).describe('예수금 라벨. get_portfolio 의 cashAccounts 라벨 사용'),
                amount: z.number().min(0).describe('설정할 금액(원)'),
            },
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ label, amount }) => run(() => setCash(userId, label, amount)),
    )

    return server
}

async function handle(request: Request, ctx: { params: Promise<{ token: string }> }) {
    const expected = process.env.MCP_ACCESS_TOKEN
    if (!expected || expected.length < MIN_TOKEN_LENGTH) return notFound()

    const { token } = await ctx.params
    const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!tokenMatches(token, expected) && !tokenMatches(bearer, expected)) return notFound()

    const userId = await resolveOwnerId()
    if (!userId) {
        console.error('[mcp] MCP_OWNER_EMAIL 이 없거나 해당 사용자가 없습니다.')
        return notFound()
    }

    // Stateless: 요청마다 서버·트랜스포트를 새로 만든다 (서버리스 인스턴스 간 세션 공유 불필요).
    const server = buildServer(userId)
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    })
    await server.connect(transport)
    return transport.handleRequest(request)
}

export { handle as GET, handle as POST, handle as DELETE }
