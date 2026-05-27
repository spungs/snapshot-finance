import { SchemaType } from '@google/generative-ai'

/**
 * Gemini Vision 에 전달하는 OCR 시스템 프롬프트.
 * 한국 증권사 앱 잔고 캡쳐 도메인에 특화되어 있다.
 *
 * 규칙은 spec 8.3 절을 그대로 옮긴 것.
 * 모델이 자유 텍스트로 답하지 않고 responseSchema 에 맞춘 JSON 만 반환하도록 강제한다.
 */
export const OCR_SYSTEM_PROMPT = `당신은 한국 증권사 앱 잔고 캡쳐 이미지에서 보유 종목을 추출하는 도우미입니다.
사용자의 자산을 등록할 데이터이므로 추측하지 말고 캡쳐에 실제로 적힌 값만 추출하세요.

## 추출 대상
- stockName: 종목명(한글 또는 영문). 캡쳐에 적힌 표기 그대로. 임의 번역·표기 변경 금지.
- quantity: 보유 수량(주). 단위 "주" 제거, 숫자만.
- averagePrice: 평균 매수가(=평단). 단위·콤마 제거. 캡쳐에 평단/매입가 컬럼이
  없으면 비워둠. 평가손익·수익률 같은 다른 컬럼으로 추측하지 말 것.
- currency: 'KRW' 또는 'USD'. 한국 시장이면 KRW, 미국 시장이면 USD. 알 수 없으면 비워둠.
- purchaseRate: USD 종목 매입 시점 환율. 캡쳐에 환율 컬럼이 있을 때만 채움. 없으면 비워둠.

## 흔한 함정 (반드시 피할 것)
- "평가금액", "평가손익", "수익률", "현재가", "오늘 변동" 같은 컬럼은 절대 추출하지 마세요.
- 종목명 옆의 [ETF], [채권], [리츠] 같은 태그는 stockName 에 그대로 포함하세요.
- 캡쳐가 흐릿하거나 잘려서 값을 확신할 수 없으면 holdings 빈 배열을 반환하세요. 추측 금지.
- 헤더·요약·합계 줄은 추출하지 마세요. "총 평가금액", "총 손익" 등.
- 평단가 컬럼이 캡쳐에 없으면 그 종목의 averagePrice 는 비워두고 stockName + quantity 만 반환하세요. 0 이나 "수익률" 값으로 임의 채우지 말 것.

## 금지
- 자유 텍스트로 답하지 말 것. responseSchema 를 따르는 JSON 만.
- 수량 0, 음수, 평단가 0/음수 반환 금지. 그런 행은 추출에서 제외.
- 종목명 임의 번역(예: "Apple"을 "애플"로 바꾸기) 금지. 캡쳐 표기 그대로.

## 예시 (참고용, 절대 응답에 포함하지 말 것)
캡쳐: "삼성전자  100주  74,300원  +12.5%"
→ { stockName: "삼성전자", quantity: 100, averagePrice: 74300, currency: "KRW" }

캡쳐: "AAPL  5주  $234.5  매입환율 1,390"
→ { stockName: "AAPL", quantity: 5, averagePrice: 234.5, currency: "USD", purchaseRate: 1390 }
` as const

/**
 * Gemini structured output 강제용 responseSchema.
 * holdings 배열 한 필드만 반환. items 의 필수 필드는 stockName, quantity.
 * averagePrice 는 캡쳐에 평단 컬럼이 있을 때만 채우도록 optional 처리.
 */
export const OCR_RESPONSE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        holdings: {
            type: SchemaType.ARRAY,
            description: '이미지에서 인식한 보유 종목 목록',
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    stockName: { type: SchemaType.STRING, description: '종목명 (한글 또는 영문 그대로)' },
                    quantity: { type: SchemaType.NUMBER, description: '보유 수량 (주)' },
                    averagePrice: { type: SchemaType.NUMBER, description: '평균 매수가 (단위 없이 숫자만)' },
                    currency: {
                        type: SchemaType.STRING,
                        format: 'enum',
                        enum: ['KRW', 'USD'],
                        description: '통화. 모호하면 비워둠',
                    },
                    purchaseRate: {
                        type: SchemaType.NUMBER,
                        description: 'USD 매입 시점 환율. 캡쳐에 환율 컬럼이 있을 때만',
                    },
                },
                required: ['stockName', 'quantity'],
            },
        },
    },
    required: ['holdings'],
} as const

/** Gemini Vision 호출 응답을 strongly type 한다. */
export type OcrHoldingItem = {
    stockName: string
    quantity: number
    averagePrice?: number
    currency?: 'KRW' | 'USD'
    purchaseRate?: number
}

export type OcrResponse = {
    holdings: OcrHoldingItem[]
}
