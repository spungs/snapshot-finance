import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { auth } from '@/lib/auth'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

export type ActionType = 'add_holding' | 'update_holding' | 'delete_holding' | 'update_cash_balance'

export interface ParsedAction {
    type: ActionType
    stockName?: string
    quantity?: number
    averagePrice?: number
    currency?: 'KRW' | 'USD'
    amount?: number
}

interface HoldingContext {
    stockName: string
    quantity: number
    averagePrice: number
    currency: string
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 })
        }

        const { message, holdingsContext } = await request.json() as {
            message: string
            holdingsContext: HoldingContext[]
        }

        if (!message?.trim()) {
            return NextResponse.json({ success: false, error: '메시지가 없습니다.' }, { status: 400 })
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash-lite',
            tools: [{
                functionDeclarations: [
                    {
                        name: 'add_holding',
                        description: '새로운 종목을 포트폴리오에 추가합니다',
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                stockName: { type: SchemaType.STRING, description: '종목명 (한글 또는 영문)' },
                                quantity: { type: SchemaType.NUMBER, description: '매수 수량' },
                                averagePrice: { type: SchemaType.NUMBER, description: '평균 매수가격' },
                                currency: { type: SchemaType.STRING, description: '통화 (KRW 또는 USD)' },
                            },
                            required: ['stockName', 'quantity', 'averagePrice'],
                        },
                    },
                    {
                        name: 'update_holding',
                        description: '기존 보유 종목의 수량 또는 평균 매수가를 수정합니다',
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                stockName: { type: SchemaType.STRING, description: '종목명' },
                                quantity: { type: SchemaType.NUMBER, description: '새로운 수량' },
                                averagePrice: { type: SchemaType.NUMBER, description: '새로운 평균 매수가' },
                            },
                            required: ['stockName'],
                        },
                    },
                    {
                        name: 'delete_holding',
                        description: '보유 종목을 포트폴리오에서 삭제합니다',
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                stockName: { type: SchemaType.STRING, description: '삭제할 종목명' },
                            },
                            required: ['stockName'],
                        },
                    },
                    {
                        name: 'update_cash_balance',
                        description: '예수금(현금 잔액)을 변경합니다',
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                amount: { type: SchemaType.NUMBER, description: '새로운 예수금 금액 (KRW 기준 원화)' },
                            },
                            required: ['amount'],
                        },
                    },
                ],
            }],
        })

        const holdingsText = holdingsContext.length > 0
            ? `현재 보유 종목:\n${holdingsContext.map(h => `- ${h.stockName}: ${h.quantity}주, 평단가 ${h.averagePrice.toLocaleString()} ${h.currency}`).join('\n')}`
            : '현재 보유 종목 없음'

        const prompt = `당신은 주식 포트폴리오 관리 어시스턴트입니다.
사용자의 요청을 분석하여 적절한 함수를 호출하세요.

${holdingsText}

사용자 요청: ${message}

규칙:
- 종목 추가 시 currency가 명시되지 않으면 한국 주식(KOSPI/KOSDAQ)은 KRW, 미국 주식은 USD로 설정하세요
- 수량이나 가격에 단위(주, 원, 달러 등)가 붙어있으면 숫자만 추출하세요
- 포트폴리오 수정 요청이 아닌 질문이면 함수를 호출하지 말고 텍스트로 안내하세요`

        const result = await model.generateContent(prompt)
        const response = result.response

        const functionCalls = response.functionCalls()

        if (functionCalls && functionCalls.length > 0) {
            const fc = functionCalls[0]
            const action: ParsedAction = {
                type: fc.name as ActionType,
                ...(fc.args as object),
            }

            let reply = ''
            switch (action.type) {
                case 'add_holding':
                    reply = `**${action.stockName}** ${action.quantity}주를 평균 ${action.averagePrice?.toLocaleString()}${action.currency === 'USD' ? '$' : '원'}에 추가할까요?`
                    break
                case 'update_holding': {
                    const updates: string[] = []
                    if (action.quantity !== undefined) updates.push(`수량 ${action.quantity}주`)
                    if (action.averagePrice !== undefined) updates.push(`평단가 ${action.averagePrice.toLocaleString()}`)
                    reply = `**${action.stockName}**을 ${updates.join(', ')}(으)로 수정할까요?`
                    break
                }
                case 'delete_holding':
                    reply = `**${action.stockName}**을 포트폴리오에서 삭제할까요?`
                    break
                case 'update_cash_balance':
                    reply = `예수금을 **${action.amount?.toLocaleString()}원**으로 변경할까요?`
                    break
            }

            return NextResponse.json({ success: true, action, reply })
        }

        const text = response.text()
        return NextResponse.json({
            success: true,
            action: null,
            reply: text || '요청을 이해하지 못했습니다. 다시 입력해주세요.',
        })

    } catch (error) {
        console.error('AI portfolio error:', error)
        return NextResponse.json(
            { success: false, error: 'AI 처리 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}
