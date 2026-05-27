import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { auth } from '@/lib/auth'
import { ratelimit, checkRateLimit } from '@/lib/ratelimit'
import { isProUser } from '@/lib/billing/subscription'
import { OCR_SYSTEM_PROMPT, OCR_RESPONSE_SCHEMA, type OcrResponse } from '@/lib/ai/ocr-prompt'
import { analyzeBulkImport, type ImportItem } from '@/app/actions/admin-actions'

// Vercel function 콜드 스타트 + Gemini Vision 첫 호출 + analyzeBulkImport(KIS/Yahoo)
// 까지 60초 안에 끝나야 함. AI 어시 route 와 동일 정책.
export const maxDuration = 60

// payload 4MB 한계 (Vercel function body 4.5MB 안전 마진).
// base64 길이는 raw bytes 의 약 1.37 배이므로 이 한계는 raw ~3MB 에 해당.
const MAX_BASE64_BYTES = 4 * 1024 * 1024

const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY
if (!GOOGLE_AI_API_KEY) {
    console.warn('[ai/ocr-import] GOOGLE_AI_API_KEY is not set. OCR endpoint will return 503.')
}
const genAI = GOOGLE_AI_API_KEY ? new GoogleGenerativeAI(GOOGLE_AI_API_KEY) : null

type RequestBody = {
    imageBase64?: unknown
    mimeType?: unknown
}

export async function POST(request: NextRequest) {
    try {
        if (!genAI) {
            return NextResponse.json(
                { success: false, error: 'AI 어시스턴트가 설정되지 않았습니다. 관리자에게 문의해주세요.' },
                { status: 503 },
            )
        }

        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 })
        }

        // admin 은 비용/남용 우려 대상이 아니므로 burst/daily 모두 통과.
        const isAdmin = session.user.role === 'admin'

        // PRO 전용 가드 — UI 잠금 우회 방지용 서버 가드. admin 은 isProUser 안에서 통과.
        if (!(await isProUser(session.user.id))) {
            return NextResponse.json(
                { success: false, error: 'OCR은 PRO 플랜 전용 기능입니다.', code: 'PRO_REQUIRED' },
                { status: 403 },
            )
        }

        // 1) burst: 5회/분 — 단기 남용·동시 호출 차단
        const burstResult = isAdmin ? null : await checkRateLimit(ratelimit.ocr, session.user.id)
        if (burstResult && !burstResult.success) {
            return NextResponse.json(
                { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': burstResult.limit.toString(),
                        'X-RateLimit-Remaining': burstResult.remaining.toString(),
                        'X-RateLimit-Reset': burstResult.reset.toString(),
                    },
                },
            )
        }

        // 2) daily: 10회/24h — 일일 비용 한도. reset 은 epoch seconds.
        const dailyResult = isAdmin ? null : await checkRateLimit(ratelimit.ocrDaily, session.user.id)
        if (dailyResult && !dailyResult.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: '오늘의 이미지 인식 한도를 모두 사용했어요. 자정에 초기화됩니다.',
                    code: 'OCR_DAILY_LIMIT',
                    resetAt: dailyResult.reset,
                },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': dailyResult.limit.toString(),
                        'X-RateLimit-Remaining': dailyResult.remaining.toString(),
                        'X-RateLimit-Reset': dailyResult.reset.toString(),
                        'X-RateLimit-Scope': 'daily',
                    },
                },
            )
        }

        // payload 파싱
        const body = (await request.json()) as RequestBody
        const { imageBase64, mimeType } = body

        if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
            return NextResponse.json(
                { success: false, error: '이미지 데이터가 없습니다.' },
                { status: 400 },
            )
        }
        if (typeof mimeType !== 'string' || !SUPPORTED_MIME_TYPES.has(mimeType)) {
            return NextResponse.json(
                { success: false, error: 'PNG·JPG·WEBP만 지원합니다.' },
                { status: 400 },
            )
        }

        // base64 길이 → raw bytes 추정. 클라이언트가 압축을 회피했을 때를 위한 서버 2차 차단.
        const estimatedRawBytes = Math.floor((imageBase64.length * 3) / 4)
        if (estimatedRawBytes > MAX_BASE64_BYTES) {
            return NextResponse.json(
                { success: false, error: '이미지가 너무 큽니다. 4MB 이하로 압축해주세요.' },
                { status: 413 },
            )
        }

        // 클라이언트가 data URL prefix(`data:image/png;base64,`)를 보냈을 수도 있으니 정규화.
        const stripped = imageBase64.includes(',')
            ? imageBase64.slice(imageBase64.indexOf(',') + 1)
            : imageBase64

        // Gemini Vision 호출
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: OCR_SYSTEM_PROMPT,
            generationConfig: {
                responseMimeType: 'application/json',
                // OCR_RESPONSE_SCHEMA 는 as const 라 readonly. SDK 타입은 mutable 을 기대하므로 cast.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: OCR_RESPONSE_SCHEMA as any,
                temperature: 0,
            },
        })

        const result = await model.generateContent([
            { inlineData: { mimeType, data: stripped } },
        ])
        const responseText = result.response.text()

        let parsed: OcrResponse
        try {
            parsed = JSON.parse(responseText)
        } catch {
            console.error('[ai/ocr-import] Gemini returned non-JSON:', responseText.slice(0, 200))
            return NextResponse.json(
                { success: false, error: '이미지 분석에 실패했습니다. 다시 시도해주세요.' },
                { status: 502 },
            )
        }

        const holdings = Array.isArray(parsed.holdings) ? parsed.holdings : []

        // 빈 결과 — OCR 실패가 아닌 정상 응답이지만, UI 가 명확히 빈 상태를 그릴 수 있도록 200 반환.
        if (holdings.length === 0) {
            return NextResponse.json({
                success: true,
                resolved: [],
                unresolved: [],
                detected: 0,
            })
        }

        // OcrHoldingItem → ImportItem 변환.
        // analyzeBulkImport 는 identifier 한 필드만 받으므로 stockName 을 그대로 넘김.
        // purchaseRate 는 USD 종목일 때만 의미 — KRW 종목에 잘못 들어와도 analyzeBulkImport 가 무시.
        const items: ImportItem[] = holdings
            .filter(
                h =>
                    typeof h?.stockName === 'string' &&
                    h.stockName.trim().length > 0 &&
                    typeof h?.quantity === 'number' &&
                    h.quantity > 0 &&
                    typeof h?.averagePrice === 'number' &&
                    h.averagePrice > 0,
            )
            .map(h => ({
                identifier: h.stockName.trim(),
                quantity: Math.trunc(h.quantity),
                averagePrice: h.averagePrice,
                ...(typeof h.purchaseRate === 'number' && h.purchaseRate > 0
                    ? { purchaseRate: h.purchaseRate }
                    : {}),
            }))

        if (items.length === 0) {
            return NextResponse.json({
                success: true,
                resolved: [],
                unresolved: [],
                detected: holdings.length,
            })
        }

        // 기존 일괄등록 분석 함수 — KIS Master + Yahoo fallback + USD 환율 자동채움.
        // 100개 가드는 analyzeBulkImport 내부에서 처리됨.
        const analysis = await analyzeBulkImport(items)

        if (!analysis.success) {
            return NextResponse.json(
                { success: false, error: analysis.error ?? '분석에 실패했습니다.' },
                { status: 500 },
            )
        }

        return NextResponse.json({
            success: true,
            resolved: analysis.resolved,
            unresolved: analysis.unresolved,
            detected: holdings.length,
        })
    } catch (error) {
        console.error('[ai/ocr-import] error:', error)

        const errMsg = error instanceof Error ? error.message : String(error)
        const errStatus = (error as { status?: number })?.status

        if (errStatus === 429 || /RESOURCE_EXHAUSTED|quota/i.test(errMsg)) {
            return NextResponse.json(
                { success: false, error: '이미지 인식 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
                { status: 429 },
            )
        }
        if (errStatus === 401 || errStatus === 403 || /UNAUTHENTICATED|API key/i.test(errMsg)) {
            return NextResponse.json(
                { success: false, error: 'AI 어시스턴트 인증에 실패했습니다. 관리자에게 문의해주세요.' },
                { status: 503 },
            )
        }

        return NextResponse.json(
            { success: false, error: '이미지 분석 중 오류가 발생했습니다.' },
            { status: 500 },
        )
    }
}
