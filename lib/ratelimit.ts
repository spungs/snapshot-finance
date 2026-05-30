import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Upstash Redis 인스턴스 생성.
// Vercel "Sensitive" 환경변수는 빌드(collect page data) 시점에 복호화되지 않아 암호문
// ('eyJ2...')이 그대로 들어온다. 유효한 https URL 일 때만 생성해 빌드 단계 크래시(UrlError)를
// 방지한다. 런타임에서는 Vercel 이 복호화한 실제 URL 이 주입되므로 정상 동작 (cache.ts 와 동일 정책).
const redisUrl = process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
const redis =
    redisUrl && redisUrl.startsWith('https') && redisToken
        ? new Redis({ url: redisUrl, token: redisToken })
        : null

// redis 가 없으면(빌드 단계/Redis 비활성) limiter 도 null → checkRateLimit 이 fail-open(통과) 처리.
function makeLimiter(
    limiter: ReturnType<typeof Ratelimit.slidingWindow>,
    prefix: string,
): Ratelimit | null {
    return redis ? new Ratelimit({ redis, limiter, analytics: true, prefix }) : null
}

// Rate limiters for different use cases
export const ratelimit = {
    // 일반 API 호출: 10 요청 / 10초
    api: makeLimiter(Ratelimit.slidingWindow(10, '10 s'), '@upstash/ratelimit/api'),

    // 인증 엔드포인트: 5 요청 / 60초 (무차별 대입 방지)
    auth: makeLimiter(Ratelimit.slidingWindow(5, '60 s'), '@upstash/ratelimit/auth'),

    // 검색 API: 20 요청 / 30초
    search: makeLimiter(Ratelimit.slidingWindow(20, '30 s'), '@upstash/ratelimit/search'),

    // 시뮬레이션 (외부 API 호출): 5 요청 / 60초
    simulation: makeLimiter(Ratelimit.slidingWindow(5, '60 s'), '@upstash/ratelimit/simulation'),

    // AI 챗 burst (Gemini API 단기 남용 방지): 10 요청 / 60초
    ai: makeLimiter(Ratelimit.slidingWindow(10, '60 s'), '@upstash/ratelimit/ai'),

    // AI 챗 일일 한도 (비용 통제): 10 요청 / 24시간 — 사용자별 (PRO 일일 한도)
    aiDaily: makeLimiter(Ratelimit.slidingWindow(10, '1 d'), '@upstash/ratelimit/ai-daily'),

    // OCR burst (Gemini Vision 단기 남용 방지): 5 요청 / 60초
    ocr: makeLimiter(Ratelimit.slidingWindow(5, '60 s'), '@upstash/ratelimit/ocr'),

    // OCR 일일 한도 (이미지 토큰 비용 통제): 10 요청 / 24시간 — 사용자별 (PRO 일일 한도)
    ocrDaily: makeLimiter(Ratelimit.slidingWindow(10, '1 d'), '@upstash/ratelimit/ocr-daily'),
}

// IP 주소 추출 헬퍼
export function getIP(request: Request): string {
    // Vercel 프록시 헤더 확인
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')

    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim()
    }

    if (realIp) {
        return realIp
    }

    return 'anonymous'
}

// Rate limit 검사 및 응답 헬퍼
export async function checkRateLimit(
    limiter: Ratelimit | null,
    identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number } | null> {
    // dev 환경에서는 rate limit 강제 통과 — .env.development.local 에 UPSTASH_* 빈 값이
    // 있어도 Redis 인스턴스는 운영 URL 로 생성될 수 있어 호출 시 운영 ratelimit 의 stale
    // count 를 사용하는 위험 방지. (cache.ts 와 동일한 dev/prod 분리 정책.)
    if (process.env.NODE_ENV !== 'production') {
        return null
    }
    // limiter 미구성(Redis 비활성/빌드 단계) → fail-open(통과)
    if (!limiter) {
        return null
    }
    try {
        const { success, limit, remaining, reset } = await limiter.limit(identifier)

        if (!success) {
            return { success: false, limit, remaining, reset }
        }

        return null // Rate limit OK
    } catch (error) {
        console.error('Rate limit check error:', error)
        // Rate limiter 실패 시 요청 허용 (fail-open)
        return null
    }
}
