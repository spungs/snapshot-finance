import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
    /**
     * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
     */
    interface Session {
        user: {
            /** The user's id. */
            id: string
            isAutoSnapshotEnabled?: boolean
            role?: string
        } & DefaultSession["user"]
    }

    interface User {
        isAutoSnapshotEnabled?: boolean
        role?: string
    }
}

declare module "next-auth/jwt" {
    /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
    interface JWT {
        /** OpenID ID Token */
        idToken?: string
        isAutoSnapshotEnabled?: boolean
        role?: string
        /** 마지막으로 DB에서 사용자 필드를 갱신한 시각 (ms) - TTL 기반 리프레시용 */
        lastDbRefresh?: number
    }
}
