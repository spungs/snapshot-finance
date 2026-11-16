import { NextRequest, NextResponse } from 'next/server'
import { ratelimit, getIP, checkRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

// 에러 바운더리(app/dashboard/error.tsx)가 잡은 예외를 서버 로그로 남긴다.
// 브라우저에서만 터지는 예외(청크 로드 실패, 클라이언트 렌더 예외)는 서버 로그에
// 흔적이 없어 원인 추적이 불가능했다 — console.error 로 찍어 Vercel 런타임 에러
// 집계(7일 보관)에 잡히게 한다.
//
// auth() 를 부르지 않는다: DB 장애로 오류 화면이 뜬 경우에도 기록이 남아야 한다.

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

export async function POST(request: NextRequest) {
    const rl = await checkRateLimit(ratelimit.api, getIP(request))
    if (rl && !rl.success) {
        return NextResponse.json({ success: false }, { status: 429 })
    }

    let body: Record<string, unknown>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ success: false }, { status: 400 })
    }

    const name = clip(body.name, 100)
    const message = clip(body.message, 500)
    const lines = [
        `[ClientError] ${name}: ${message}`,
        `path=${clip(body.path, 300)} digest=${clip(body.digest, 100)}`,
        `ua=${clip(request.headers.get('user-agent'), 300)}`,
        clip(body.stack, 3000),
    ]
    console.error(lines.join('\n'))

    return NextResponse.json({ success: true })
}
