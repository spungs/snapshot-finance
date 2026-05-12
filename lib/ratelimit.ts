import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Upstash Redis 인스턴스 생성
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Rate limiters for different use cases
export const ratelimit = {
    // 일반 API 호출: 10 요청 / 10초
    api: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '10 s'),
        analytics: true,
        prefix: '@upstash/ratelimit/api',
    }),

    // 인증 엔드포인트: 5 요청 / 60초 (무차별 대입 방지)
    auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        analytics: true,
        prefix: '@upstash/ratelimit/auth',
    }),

    // 검색 API: 20 요청 / 30초
    search: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '30 s'),
        analytics: true,
        prefix: '@upstash/ratelimit/search',
    }),

    // 시뮬레이션 (외부 API 호출): 5 요청 / 60초
    simulation: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        analytics: true,
        prefix: '@upstash/ratelimit/simulation',
    }),

    // AI 챗 burst (Gemini API 단기 남용 방지): 10 요청 / 60초
    ai: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '60 s'),
        analytics: true,
        prefix: '@upstash/ratelimit/ai',
    }),

    // AI 챗 일일 한도 (비용 통제): 3 요청 / 24시간 — 사용자별 (무료 티어)
    aiDaily: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, '1 d'),
        analytics: true,
        prefix: '@upstash/ratelimit/ai-daily',
    }),
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
    limiter: Ratelimit,
    identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number } | null> {
    // dev 환경에서는 rate limit 강제 통과 — .env.development.local 에 UPSTASH_* 빈 값이
    // 있어도 Redis 인스턴스는 운영 URL 로 생성될 수 있어 호출 시 운영 ratelimit 의 stale
    // count 를 사용하는 위험 방지. (cache.ts 와 동일한 dev/prod 분리 정책.)
    if (process.env.NODE_ENV !== 'production') {
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
