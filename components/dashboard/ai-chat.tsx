'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Drawer } from 'vaul'
import { Sparkles, SendHorizonal, X, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { updateCashBalance } from '@/app/actions/cash-actions'
import type { ParsedAction } from '@/app/api/ai/portfolio/route'

interface HoldingContext {
    id: string
    stockId: string
    stockName: string
    quantity: number
    averagePrice: number
    currency: string
}

interface Message {
    role: 'user' | 'assistant'
    content: string
    action?: ParsedAction
    actionState?: 'pending' | 'confirmed' | 'rejected'
    // update/delete 시 보유 종목에 부분 일치하는 후보가 여러 개일 때 사용자에게 선택받기 위한 후보 목록.
    disambiguationCandidates?: HoldingContext[]
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

// 보유 종목 목록에서 양방향 부분 일치하는 모든 후보를 반환.
// 정확 일치(대소문자 무시)가 있으면 그것만 우선 반환해 모호성을 제거한다.
function findHoldingMatches(holdings: HoldingContext[], query: string): HoldingContext[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const exact = holdings.filter(h => h.stockName.toLowerCase() === q)
    if (exact.length > 0) return exact
    return holdings.filter(h => {
        const name = h.stockName.toLowerCase()
        return name.includes(q) || q.includes(name)
    })
}

// API 응답 형식이 일관되지 않아(`error: '...'` vs `error: { message: '...' }`) 헬퍼로 통일.
// res.ok와 data.success를 모두 검사하고, 실패 시 서버 메시지를 그대로 throw해 사용자 토스트에 노출한다.
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

export function AiChat({ isAuthenticated = false }: AiChatProps) {
    const [holdings, setHoldings] = useState<HoldingContext[]>([])
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

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 150)
            fetchHoldingsData()
        }
    }, [open, fetchHoldingsData])

    const sendMessage = useCallback(async () => {
        const trimmed = input.trim()
        if (!trimmed || loading) return

        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: trimmed }])
        setLoading(true)

        try {
            const holdingsContext = holdings.map(h => ({
                stockName: h.stockName,
                quantity: h.quantity,
                averagePrice: h.averagePrice,
                currency: h.currency,
            }))

            const res = await fetch('/api/ai/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: trimmed, holdingsContext }),
            })

            const data = await res.json()

            if (data.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.reply,
                    action: data.action,
                    actionState: data.action ? 'pending' : undefined,
                }])
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.error || '오류가 발생했습니다.',
                }])
            }
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '연결에 실패했습니다. 다시 시도해주세요.',
            }])
        } finally {
            setLoading(false)
        }
    }, [input, loading, holdings])

    // resolvedHoldingId: 사용자가 disambiguation에서 특정 보유 종목을 선택한 경우 매칭을 우회.
    const executeAction = useCallback(async (action: ParsedAction, msgIndex: number, resolvedHoldingId?: string) => {
        setExecuting(true)

        try {
            switch (action.type) {
                case 'add_holding': {
                    const searchData = await callApi<{ success: boolean; data: { symbol: string; market: string; nameKo?: string; name: string; nameEn?: string; type?: string }[] }>(
                        `/api/stocks/search?query=${encodeURIComponent(action.stockName!)}`
                    )

                    if (!searchData.data || searchData.data.length === 0) {
                        throw new Error(`'${action.stockName}' 종목을 찾을 수 없습니다.`)
                    }

                    const stockResult = searchData.data[0]

                    const stockData = await callApi<{ success: boolean; data: { id: string } }>('/api/stocks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            stockCode: normalizeStockCode(stockResult.symbol, stockResult.market),
                            stockName: stockResult.nameKo || stockResult.name,
                            engName: stockResult.nameEn,
                            market: stockResult.market,
                            sector: stockResult.type,
                        }),
                    })

                    await callApi('/api/holdings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            stockId: stockData.data.id,
                            quantity: action.quantity,
                            averagePrice: action.averagePrice,
                            currency: action.currency || 'KRW',
                        }),
                    })

                    toast.success(`${action.stockName} ${action.quantity}주가 추가되었습니다.`)
                    break
                }

                case 'update_holding': {
                    let holding: HoldingContext | undefined
                    if (resolvedHoldingId) {
                        holding = holdings.find(h => h.id === resolvedHoldingId)
                    } else {
                        const matches = findHoldingMatches(holdings, action.stockName!)
                        if (matches.length === 0) throw new Error(`'${action.stockName}' 보유 종목을 찾을 수 없습니다.`)
                        if (matches.length > 1) {
                            // 모호한 매칭 — 사용자에게 선택을 요청하고 실행을 보류
                            setMessages(prev => prev.map((m, i) =>
                                i === msgIndex
                                    ? { ...m, content: `'${action.stockName}'에 일치하는 종목이 여러 개입니다. 어떤 종목을 수정할까요?`, disambiguationCandidates: matches }
                                    : m
                            ))
                            setExecuting(false)
                            return
                        }
                        holding = matches[0]
                    }
                    if (!holding) throw new Error('보유 종목을 찾을 수 없습니다.')

                    await callApi(`/api/holdings/${holding.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...(action.quantity !== undefined && { quantity: action.quantity }),
                            ...(action.averagePrice !== undefined && { averagePrice: action.averagePrice }),
                        }),
                    })

                    toast.success(`${holding.stockName} 정보가 수정되었습니다.`)
                    break
                }

                case 'delete_holding': {
                    let holding: HoldingContext | undefined
                    if (resolvedHoldingId) {
                        holding = holdings.find(h => h.id === resolvedHoldingId)
                    } else {
                        const matches = findHoldingMatches(holdings, action.stockName!)
                        if (matches.length === 0) throw new Error(`'${action.stockName}' 보유 종목을 찾을 수 없습니다.`)
                        if (matches.length > 1) {
                            setMessages(prev => prev.map((m, i) =>
                                i === msgIndex
                                    ? { ...m, content: `'${action.stockName}'에 일치하는 종목이 여러 개입니다. 어떤 종목을 삭제할까요?`, disambiguationCandidates: matches }
                                    : m
                            ))
                            setExecuting(false)
                            return
                        }
                        holding = matches[0]
                    }
                    if (!holding) throw new Error('보유 종목을 찾을 수 없습니다.')

                    await callApi(`/api/holdings/${holding.id}`, { method: 'DELETE' })

                    toast.success(`${holding.stockName}이(가) 삭제되었습니다.`)
                    break
                }

                case 'update_cash_balance': {
                    const result = await updateCashBalance(action.amount!)
                    if (!result.success) throw new Error(result.error || '예수금 변경에 실패했습니다.')
                    toast.success(`예수금이 ${action.amount?.toLocaleString()}원으로 변경되었습니다.`)
                    break
                }
            }

            setMessages(prev => prev.map((m, i) =>
                i === msgIndex ? { ...m, actionState: 'confirmed', disambiguationCandidates: undefined } : m
            ))
            await fetchHoldingsData()
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
    }, [holdings, router, fetchHoldingsData])

    const rejectAction = (msgIndex: number) => {
        setMessages(prev => prev.map((m, i) =>
            i === msgIndex ? { ...m, actionState: 'rejected' } : m
        ))
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

            <Drawer.Root open={open} onOpenChange={setOpen} direction="bottom">
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
                    <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background border-t rounded-t-2xl max-h-[80vh] outline-none">
                        <div className="flex justify-center pt-3 pb-1 shrink-0">
                            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                        </div>

                        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
                            <Drawer.Title className="flex items-center gap-2 font-semibold text-sm m-0">
                                <Sparkles className="w-4 h-4 text-primary" />
                                AI 포트폴리오 어시스턴트
                            </Drawer.Title>
                            <Drawer.Description className="sr-only">
                                자연어로 포트폴리오를 수정할 수 있는 AI 어시스턴트
                            </Drawer.Description>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-muted-foreground hover:text-foreground p-1"
                                aria-label="닫기"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                            {messages.length === 0 && (
                                <div className="text-center text-sm text-muted-foreground py-8 space-y-1">
                                    <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                    <p className="font-medium">포트폴리오를 자연어로 수정해보세요</p>
                                    <p className="text-xs opacity-60">{'"삼성전자 100주 추가해줘"'}</p>
                                    <p className="text-xs opacity-60">{'"애플 평단가 190달러로 수정해줘"'}</p>
                                    <p className="text-xs opacity-60">{'"예수금 500만원으로 변경해줘"'}</p>
                                    <p className="text-xs opacity-60">{'"테슬라 삭제해줘"'}</p>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-foreground'
                                        }`}>
                                        <p
                                            className="whitespace-pre-wrap"
                                            dangerouslySetInnerHTML={{
                                                __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                            }}
                                        />

                                        {msg.action && msg.actionState === 'pending' && msg.disambiguationCandidates && msg.disambiguationCandidates.length > 0 && (
                                            <div className="mt-2 flex flex-col gap-1.5">
                                                {msg.disambiguationCandidates.map(c => (
                                                    <Button
                                                        key={c.id}
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-auto py-1.5 text-xs justify-start"
                                                        onClick={() => executeAction(msg.action!, i, c.id)}
                                                        disabled={executing}
                                                    >
                                                        {c.stockName} <span className="ml-1 opacity-60">({c.quantity}주)</span>
                                                    </Button>
                                                ))}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs"
                                                    onClick={() => rejectAction(i)}
                                                    disabled={executing}
                                                >
                                                    취소
                                                </Button>
                                            </div>
                                        )}

                                        {msg.action && msg.actionState === 'pending' && !msg.disambiguationCandidates && (
                                            <div className="mt-2 flex gap-2">
                                                <Button
                                                    size="sm"
                                                    className="h-7 text-xs flex-1"
                                                    onClick={() => executeAction(msg.action!, i)}
                                                    disabled={executing}
                                                >
                                                    {executing
                                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                                        : <><Check className="w-3 h-3 mr-1" />확인</>
                                                    }
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs flex-1"
                                                    onClick={() => rejectAction(i)}
                                                    disabled={executing}
                                                >
                                                    취소
                                                </Button>
                                            </div>
                                        )}
                                        {msg.actionState === 'confirmed' && (
                                            <p className="mt-1 text-xs opacity-60 flex items-center gap-1">
                                                <Check className="w-3 h-3" /> 완료
                                            </p>
                                        )}
                                        {msg.actionState === 'rejected' && (
                                            <p className="mt-1 text-xs opacity-60">취소됨</p>
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
                                placeholder="포트폴리오 수정 요청을 입력하세요..."
                                className="flex-1 text-sm bg-muted rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
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
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        </>
    )
}
