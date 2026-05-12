'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sparkles, SendHorizonal, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { ParsedAction } from '@/app/api/ai/portfolio/route'
import {
    AiActionCard,
    type ConfirmData,
    type HoldingContext,
    type AccountSummary,
} from './ai-action-card'

interface Message {
    role: 'user' | 'assistant'
    content: string
    action?: ParsedAction
    actionState?: 'pending' | 'confirmed' | 'rejected'
}

interface AiChatProps {
    isAuthenticated?: boolean
}

// KIS 마스터 검색 결과의 symbol은 `005930.KS` 형태이지만 Stock.stockCode는 raw 6자리로 저장됨.
// 한국 시장이면 suffix를 제거해 기존 Stock 레코드와 매칭되도록 정규화.
function normalizeStockCode(symbol: string, market?: string): string {
    if (market === 'KOSPI' || market === 'KOSDAQ') {
        return symbol.replace(/\.(KS|KQ)$/i, '')
    }
    return symbol
}

// API 응답 형식이 일관되지 않아(`error: '...'` vs `error: { message: '...' }`) 헬퍼로 통일.
async function callApi<T = unknown>(input: RequestInfo, init?: RequestInit): Promise<T> {
    let res: Response
    try {
        res = await fetch(input, init)
    } catch {
        throw new Error('네트워크 연결에 실패했습니다.')
    }

    let data: unknown = null
    try {
        data = await res.json()
    } catch {
        // JSON 파싱 실패 — 본문이 비었거나 HTML 응답
    }

    const successFlag = (data as { success?: boolean } | null)?.success
    if (!res.ok || successFlag === false) {
        const errField = (data as { error?: unknown } | null)?.error
        let message: string | undefined
        if (typeof errField === 'string') {
            message = errField
        } else if (errField && typeof errField === 'object' && 'message' in errField) {
            const m = (errField as { message?: unknown }).message
            if (typeof m === 'string') message = m
        }
        throw new Error(message || `요청이 실패했습니다 (${res.status}).`)
    }

    return data as T
}

// 포트폴리오 데이터 변경 후 portfolio-client가 자체 갱신하도록 신호.
// portfolio-client는 useState(initialHoldings)로 로컬 상태를 들고 있어 router.refresh()만으로는 갱신되지 않는다.
const PORTFOLIO_REFRESH_EVENT = 'portfolio:refresh'

// confirmed 시 msg.content 를 결과 요약으로 덮어써 "아래 카드를 확인해주세요"가 남는 모순 제거.
// 계좌가 2개 이상일 때만 계좌명을 노출 — 단일 계좌면 불필요한 노이즈.
function formatActionResult(
    data: ConfirmData,
    holdings: HoldingContext[],
    accounts: AccountSummary[],
): string {
    switch (data.type) {
        case 'add_holding': {
            const account = accounts.find(a => a.id === data.accountId)
            const accountText = account && accounts.length > 1 ? `${account.name}에 ` : ''
            const currencySymbol = data.currency === 'USD' ? '$' : '₩'
            const priceText = `@${currencySymbol}${data.averagePrice.toLocaleString()}`
            return `✓ ${accountText}**${data.stockName}** ${data.quantity}주(${priceText}) 추가했어요.`
        }
        case 'update_holding': {
            const holding = holdings.find(h => h.id === data.holdingId)
            const stockName = holding?.stockName ?? '종목'
            // 평단가 변경 없이 수량만 감소 = SellHoldingCard 경로(수량 줄이기). 별도 문구로 의도 전달.
            const isReductionOnly =
                holding != null &&
                data.averagePrice === undefined &&
                data.quantity !== undefined &&
                data.quantity < holding.quantity
            if (isReductionOnly) {
                return `✓ **${stockName}** 수량 ${data.quantity}주로 줄였어요.`
            }
            const parts: string[] = []
            if (data.quantity !== undefined) parts.push(`수량 ${data.quantity}주`)
            if (data.averagePrice !== undefined) parts.push(`평단가 ${data.averagePrice.toLocaleString()}`)
            const detail = parts.length > 0 ? ` (${parts.join(', ')})` : ''
            return `✓ **${stockName}** 수정했어요.${detail}`
        }
        case 'delete_holding': {
            const holding = holdings.find(h => h.id === data.holdingId)
            const stockName = holding?.stockName ?? '종목'
            return `✓ **${stockName}** 삭제했어요.`
        }
    }
}

function formatActionCancel(action: ParsedAction): string {
    const name = action.stockOfficialName ?? action.stockName ?? '요청'
    return `✕ **${name}** 취소했어요.`
}

export function AiChat({ isAuthenticated = false }: AiChatProps) {
    const [holdings, setHoldings] = useState<HoldingContext[]>([])
    const [accounts, setAccounts] = useState<AccountSummary[]>([])
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [executing, setExecuting] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const fetchHoldingsData = useCallback(async () => {
        try {
            const res = await fetch('/api/holdings')
            const data = await res.json()
            if (data.success && data.data?.holdings) {
                setHoldings(data.data.holdings)
            }
        } catch (err) {
            console.error('Failed to fetch holdings for AI chat', err)
        }
    }, [])

    const fetchAccountsData = useCallback(async () => {
        try {
            const res = await fetch('/api/accounts')
            const data = await res.json()
            if (data.success && Array.isArray(data.data)) {
                setAccounts(
                    data.data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
                )
            }
        } catch (err) {
            console.error('Failed to fetch accounts for AI chat', err)
        }
    }, [])

    useEffect(() => {
        if (open) {
            // 자동 포커스는 모바일에서 키보드가 모달 reposition보다 먼저 떠 input을
            // 가리는 문제가 있어 의도적으로 제거. 사용자가 input을 직접 탭해야 함.
            fetchHoldingsData()
            fetchAccountsData()
        } else {
            // 닫을 때마다 대화 상태 초기화 — 다시 열면 빈 상태로 시작
            setMessages([])
            setInput('')
        }
    }, [open, fetchHoldingsData, fetchAccountsData])

    const sendMessage = useCallback(async () => {
        const trimmed = input.trim()
        if (!trimmed || loading) return

        setInput('')
        // 새 자연어 입력 = 이전 의도 폐기 — pending 카드들을 자동 취소 처리.
        setMessages(prev => [
            ...prev.map(m =>
                m.action && m.actionState === 'pending'
                    ? { ...m, actionState: 'rejected' as const }
                    : m,
            ),
            { role: 'user', content: trimmed },
        ])
        setLoading(true)

        try {
            // accountId/accountName 포함 — 서버 prompt 가 같은 종목의 계좌 분포를 인지하도록.
            const holdingsContext = holdings.map(h => ({
                stockName: h.stockName,
                quantity: h.quantity,
                averagePrice: h.averagePrice,
                currency: h.currency,
                accountId: h.accountId,
                accountName: h.accountName,
            }))

            // 직전 화면 가이드(disambiguation 안내문 등)는 모델에 보낼 필요가 없으므로 텍스트만 추림.
            // 토큰 절약을 위해 최근 10개로 제한.
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content,
            }))

            const res = await fetch('/api/ai/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: trimmed, holdingsContext, history }),
            })

            const data = await res.json()

            if (data.success) {
                setMessages(prev => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: data.reply ?? '',
                        action: data.action ?? undefined,
                        actionState: data.action ? 'pending' : undefined,
                    },
                ])
            } else {
                setMessages(prev => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: data.error || '오류가 발생했습니다.',
                    },
                ])
            }
        } catch {
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: '연결에 실패했습니다. 다시 시도해주세요.',
                },
            ])
        } finally {
            setLoading(false)
        }
    }, [input, loading, holdings, messages])

    const executeConfirm = useCallback(
        async (data: ConfirmData, msgIndex: number) => {
            setExecuting(true)

            try {
                switch (data.type) {
                    case 'add_holding': {
                        // Stock 마스터 row 확보 — Holding 의 FK 가 걸린다. 서버 AI 라우트가 KisStockMaster 에서
                        // 정식명/시장은 이미 검증했지만, Stock 테이블의 row 는 별도로 upsert 필요.
                        const searchData = await callApi<{
                            success: boolean
                            data: {
                                symbol: string
                                market: string
                                nameKo?: string
                                name: string
                                nameEn?: string
                                type?: string
                            }[]
                        }>(`/api/stocks/search?query=${encodeURIComponent(data.stockName)}`)

                        if (!searchData.data || searchData.data.length === 0) {
                            throw new Error(`'${data.stockName}' 종목을 찾을 수 없습니다.`)
                        }

                        const stockResult = searchData.data[0]

                        const stockData = await callApi<{ success: boolean; data: { id: string } }>(
                            '/api/stocks',
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    stockCode: normalizeStockCode(stockResult.symbol, stockResult.market),
                                    stockName: stockResult.nameKo || stockResult.name,
                                    engName: stockResult.nameEn,
                                    market: stockResult.market,
                                    sector: stockResult.type,
                                }),
                            },
                        )

                        await callApi('/api/holdings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                stockId: stockData.data.id,
                                accountId: data.accountId,
                                quantity: data.quantity,
                                averagePrice: data.averagePrice,
                                currency: data.currency,
                                // "매수" 의 자연스러운 의미 = 기존 보유에 더해짐 — 평단가 손실 방지.
                                mode: 'merge',
                            }),
                        })

                        toast.success(`${data.stockName} ${data.quantity}주가 추가되었습니다.`)
                        break
                    }

                    case 'update_holding': {
                        await callApi(`/api/holdings/${data.holdingId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                ...(data.quantity !== undefined && { quantity: data.quantity }),
                                ...(data.averagePrice !== undefined && { averagePrice: data.averagePrice }),
                            }),
                        })
                        toast.success('보유 종목이 수정되었습니다.')
                        break
                    }

                    case 'delete_holding': {
                        await callApi(`/api/holdings/${data.holdingId}`, { method: 'DELETE' })
                        toast.success('보유 종목이 삭제되었습니다.')
                        break
                    }
                }

                const resultContent = formatActionResult(data, holdings, accounts)
                setMessages(prev =>
                    prev.map((m, i) =>
                        i === msgIndex
                            ? { ...m, actionState: 'confirmed', content: resultContent }
                            : m,
                    ),
                )
                await fetchHoldingsData()
                await fetchAccountsData()
                router.refresh()
                // portfolio-client는 useState로 holdings를 들고 있어 router.refresh만으로는 갱신되지 않음 → 명시 신호.
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent(PORTFOLIO_REFRESH_EVENT))
                }
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : '실행에 실패했습니다.'
                toast.error(message)
            } finally {
                setExecuting(false)
            }
        },
        [router, fetchHoldingsData, fetchAccountsData, holdings, accounts],
    )

    const rejectAction = (msgIndex: number) => {
        setMessages(prev =>
            prev.map((m, i) => {
                if (i !== msgIndex) return m
                const cancelContent = m.action ? formatActionCancel(m.action) : m.content
                return { ...m, actionState: 'rejected', content: cancelContent }
            }),
        )
    }

    if (!isAuthenticated) return null

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all duration-150"
                aria-label="AI 어시스턴트 열기"
            >
                <Sparkles className="w-5 h-5" />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="!flex !flex-col !gap-0 !p-0 sm:max-w-md h-[min(480px,70dvh)] overflow-hidden">
                    <div className="flex items-center px-4 py-3 border-b shrink-0">
                        <DialogTitle className="flex items-center gap-2 font-semibold text-sm m-0">
                            <Sparkles className="w-4 h-4 text-primary" />
                            AI 포트폴리오 어시스턴트
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            자연어로 종목을 추가·수정·삭제할 수 있는 AI 어시스턴트
                        </DialogDescription>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                        {messages.length === 0 && (
                            <div className="text-center text-xs text-muted-foreground py-6 space-y-3">
                                <Sparkles className="w-8 h-8 mx-auto opacity-20" />
                                <p className="font-medium text-sm">종목 추가·수정·삭제만 가능합니다</p>
                                <div className="space-y-1 opacity-70">
                                    <p>{'"NH에 삼성전자 100주 75000원 매수"'}</p>
                                    <p>{'"키움 삼성전자 평단가 76000원으로 수정"'}</p>
                                    <p>{'"테슬라 5주 매도"'}</p>
                                    <p>{'"테슬라 삭제"'}</p>
                                </div>
                                <div className="space-y-0.5 opacity-60 pt-2 border-t border-border/40 mx-6">
                                    <p>예수금 변경 → 홈의 예수금 카드</p>
                                    <p>계좌 관리 → 설정</p>
                                    <p>스냅샷 → 스냅샷 메뉴</p>
                                </div>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                        msg.role === 'user'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-foreground'
                                    }`}
                                >
                                    {msg.content && (
                                        <p
                                            className="whitespace-pre-wrap"
                                            dangerouslySetInnerHTML={{
                                                __html: msg.content.replace(
                                                    /\*\*(.*?)\*\*/g,
                                                    '<strong>$1</strong>',
                                                ),
                                            }}
                                        />
                                    )}

                                    {msg.action && msg.actionState === 'pending' && (
                                        <div className="mt-2">
                                            <AiActionCard
                                                action={msg.action}
                                                holdings={holdings}
                                                accounts={accounts}
                                                executing={executing}
                                                onConfirm={(data) => executeConfirm(data, i)}
                                                onCancel={() => rejectAction(i)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-muted rounded-2xl px-3 py-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className="flex gap-2 px-4 py-3 border-t shrink-0">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    sendMessage()
                                }
                            }}
                            placeholder="종목 추가·수정·삭제 요청..."
                            className="flex-1 text-base md:text-sm bg-muted rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                            disabled={loading}
                        />
                        <Button
                            size="icon"
                            onClick={sendMessage}
                            disabled={!input.trim() || loading}
                            className="shrink-0 h-9 w-9 rounded-xl"
                        >
                            <SendHorizonal className="w-4 h-4" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
