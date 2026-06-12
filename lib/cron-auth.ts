import { timingSafeEqual } from 'node:crypto'

/**
 * Cron 요청 인증 — `Authorization: Bearer <CRON_SECRET>` 헤더를 상수시간 비교한다.
 * (Supabase pg_cron 의 net.http_get 이 헤더를 부착)
 *
 * 평문 `!==` 비교는 첫 불일치 바이트에서 조기 종료되어 응답 시간으로 시크릿을
 * 한 바이트씩 추정하는 타이밍 사이드채널이 생길 수 있으므로 `timingSafeEqual` 을 쓴다.
 */
export function isAuthorizedCron(authHeader: string | null): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret || !authHeader) return false

    const provided = Buffer.from(authHeader)
    const expected = Buffer.from(`Bearer ${secret}`)
    // timingSafeEqual 은 길이가 다르면 throw — 길이는 비밀이 아니므로 사전에 분기한다.
    if (provided.length !== expected.length) return false
    return timingSafeEqual(provided, expected)
}
