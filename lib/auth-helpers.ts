import { auth } from "@/lib/auth"
import type { Session } from "next-auth"

type AdminGuardResult =
    | { session: Session; error?: never; status?: never }
    | { session?: never; error: "UNAUTHORIZED"; status: 401 }
    | { session?: never; error: "FORBIDDEN"; status: 403 }

/**
 * admin 권한이 필요한 API/Server Action에서 호출.
 * role은 DB에서 직접 UPDATE로만 변경 가능 (role 변경 API/UI 없음).
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
    const session = await auth()
    if (!session?.user) {
        return { error: "UNAUTHORIZED", status: 401 }
    }
    if (session.user.role !== "admin") {
        return { error: "FORBIDDEN", status: 403 }
    }
    return { session }
}
