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
}

interface AiChatProps {
    isAuthenticated?: boolean
}

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

    if (!isAuthenticated) return null

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

    const executeAction = useCallback(async (action: ParsedAction, msgIndex: number) => {
        setExecuting(true)

        try {
            switch (action.type) {
                case 'add_holding': {
                    const searchRes = await fetch(`/api/stocks/search?query=${encodeURIComponent(action.stockName!)}`)
                    const searchData = await searchRes.json()

                    if (!searchData.success || searchData.data.length === 0) {
                        throw new Error(`'${action.stockName}' 종목을 찾을 수 없습니다.`)
                    }

                    const stockResult = searchData.data[0]

                    const stockRes = await fetch('/api/stocks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            stockCode: stockResult.symbol,
                            stockName: stockResult.nameKo || stockResult.name,
                            engName: stockResult.nameEn,
                            market: stockResult.market,
                            sector: stockResult.type,
                        }),
                    })
                    const stockData = await stockRes.json()
                    if (!stockData.success) throw new Error('종목 등록에 실패했습니다.')

                    const holdingRes = await fetch('/api/holdings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            stockId: stockData.data.id,
                            quantity: action.quantity,
                            averagePrice: action.averagePrice,
                            currency: action.currency || 'KRW',
                        }),
                    })
                    const holdingData = await holdingRes.json()
                    if (!holdingData.success) throw new Error('종목 추가에 실패했습니다.')

                    toast.success(`${action.stockName} ${action.quantity}주가 추가되었습니다.`)
                    break
                }

                case 'update_holding': {
                    const holding = holdings.find(h =>
                        h.stockName.toLowerCase().includes(action.stockName!.toLowerCase()) ||
                        action.stockName!.toLowerCase().includes(h.stockName.toLowerCase())
                    )
                    if (!holding) throw new Error(`'${action.stockName}' 보유 종목을 찾을 수 없습니다.`)

                    const patchRes = await fetch(`/api/holdings/${holding.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...(action.quantity !== undefined && { quantity: action.quantity }),
                            ...(action.averagePrice !== undefined && { averagePrice: action.averagePrice }),
                        }),
                    })
                    const patchData = await patchRes.json()
                    if (!patchData.success) throw new Error('종목 수정에 실패했습니다.')

                    toast.success(`${action.stockName} 정보가 수정되었습니다.`)
                    break
                }

                case 'delete_holding': {
                    const holding = holdings.find(h =>
                        h.stockName.toLowerCase().includes(action.stockName!.toLowerCase()) ||
                        action.stockName!.toLowerCase().includes(h.stockName.toLowerCase())
                    )
                    if (!holding) throw new Error(`'${action.stockName}' 보유 종목을 찾을 수 없습니다.`)

                    const deleteRes = await fetch(`/api/holdings/${holding.id}`, {
                        method: 'DELETE',
                    })
                    const deleteData = await deleteRes.json()
                    if (!deleteData.success) throw new Error('종목 삭제에 실패했습니다.')

                    toast.success(`${action.stockName}이 삭제되었습니다.`)
                    break
                }

                case 'update_cash_balance': {
                    const result = await updateCashBalance(action.amount!)
                    if (!result.success) throw new Error('예수금 변경에 실패했습니다.')
                    toast.success(`예수금이 ${action.amount?.toLocaleString()}원으로 변경되었습니다.`)
                    break
                }
            }

            setMessages(prev => prev.map((m, i) =>
                i === msgIndex ? { ...m, actionState: 'confirmed' } : m
            ))
            await fetchHoldingsData()
            router.refresh()
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '실행에 실패했습니다.'
            toast.error(message)
        } finally {
            setExecuting(false)
        }
    }, [holdings, router])

    const rejectAction = (msgIndex: number) => {
        setMessages(prev => prev.map((m, i) =>
            i === msgIndex ? { ...m, actionState: 'rejected' } : m
        ))
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
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
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                <span className="font-semibold text-sm">AI 포트폴리오 어시스턴트</span>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-muted-foreground hover:text-foreground p-1"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                            {messages.length === 0 && (
                                <div className="text-center text-sm text-muted-foreground py-8 space-y-1">
                                    <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                    <p className="font-medium">포트폴리오를 자연어로 수정해보세요</p>
                                    <p className="text-xs opacity-60">"삼성전자 100주 추가해줘"</p>
                                    <p className="text-xs opacity-60">"애플 평단가 190달러로 수정해줘"</p>
                                    <p className="text-xs opacity-60">"예수금 500만원으로 변경해줘"</p>
                                    <p className="text-xs opacity-60">"테슬라 삭제해줘"</p>
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

                                        {msg.action && msg.actionState === 'pending' && (
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
