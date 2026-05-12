
import NextAuth from "next-auth"
import type { Adapter, AdapterAccount } from "@auth/core/adapters"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"

// JWT 캐시 TTL: 사용자 필드(isAutoSnapshotEnabled, deletedAt)를 5분 단위로만 DB 재검증
// - 짧으면 DB 부하, 길면 권한/탈퇴 반영 지연 → 5분이 일반적인 절충점
// - 설정 변경을 즉시 반영하려면 클라이언트에서 useSession().update() 호출 필요
const SESSION_REFRESH_TTL_MS = 5 * 60 * 1000

// Google API를 호출하지 않으므로 OAuth 토큰(refresh/access/id)을 DB에 저장하지 않음.
// 유출 자체를 불가능하게 만드는 defense-in-depth.
function buildAdapter(): Adapter {
    const base = PrismaAdapter(prisma)
    const baseLinkAccount = base.linkAccount
    if (baseLinkAccount) {
        base.linkAccount = (account: AdapterAccount) => {
            // 민감 필드만 제거하고 나머지(provider, providerAccountId, expires_at 등)는 보존
            const safe = { ...account } as Record<string, unknown>
            delete safe.refresh_token
            delete safe.access_token
            delete safe.id_token
            return baseLinkAccount(safe as AdapterAccount)
        }
    }
    return base
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: buildAdapter(),
    // PWA에서 앱을 종료했다 다시 열어도 세션이 풀리지 않도록 maxAge를 명시.
    // 기본값(30일)과 동일하지만, 환경에 따라 누락 시 짧게 처리되는 케이스가 보고되어 명시 고정.
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    ...authConfig,
    providers: [
        ...authConfig.providers,
    ],
    callbacks: {
        ...authConfig.callbacks,
        async jwt({ token, user, trigger, session }) {
            // 초기 로그인: user 객체에서 필드를 토큰에 적재
            if (user) {
                token.isAutoSnapshotEnabled = (user as { isAutoSnapshotEnabled?: boolean }).isAutoSnapshotEnabled
                token.role = (user as { role?: string }).role ?? "user"
                token.lastDbRefresh = Date.now()
                return token
            }

            // 클라이언트에서 useSession().update({ isAutoSnapshotEnabled: ... }) 호출 시
            if (trigger === "update" && session) {
                const updated = session as { isAutoSnapshotEnabled?: boolean }
                if (typeof updated.isAutoSnapshotEnabled === "boolean") {
                    token.isAutoSnapshotEnabled = updated.isAutoSnapshotEnabled
                }
                token.lastDbRefresh = Date.now()
                return token
            }

            // TTL 기반 DB 재검증: 권한/탈퇴 상태가 너무 오래 캐시되는 것 방지.
            // 동의 미완료(token.agreedAt == null)인 경우엔 TTL을 무시하고 항상 재조회 —
            // /auth/consent 에서 동의 직후 redirect 했을 때 즉시 반영되어야 한다.
            const now = Date.now()
            const lastRefresh = (token.lastDbRefresh as number | undefined) ?? 0
            const needsAgreedCheck = !token.agreedAt
            if (token.sub && (needsAgreedCheck || now - lastRefresh > SESSION_REFRESH_TTL_MS)) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: token.sub },
                    select: { deletedAt: true, isAutoSnapshotEnabled: true, role: true, agreedAt: true }
                })

                if (dbUser) {
                    token.isAutoSnapshotEnabled = dbUser.isAutoSnapshotEnabled
                    token.role = dbUser.role
                    token.agreedAt = dbUser.agreedAt ? dbUser.agreedAt.toISOString() : null

                    // 소프트 삭제 상태에서 로그인 시 복구
                    if (dbUser.deletedAt) {
                        await prisma.user.update({
                            where: { id: token.sub },
                            data: { deletedAt: null }
                        })
                    }
                }
                token.lastDbRefresh = now
            }

            return token
        },
        async session({ session, token }) {
            // session 콜백은 매 요청마다 호출됨 → DB 조회 없이 토큰에서만 읽음
            if (token.sub && session.user) {
                session.user.id = token.sub
                session.user.isAutoSnapshotEnabled = token.isAutoSnapshotEnabled as boolean | undefined
                session.user.role = (token.role as string | undefined) ?? "user"
                ;(session.user as { agreedAt?: string | null }).agreedAt =
                    (token.agreedAt as string | null | undefined) ?? null
            }
            return session
        },
    },
})
