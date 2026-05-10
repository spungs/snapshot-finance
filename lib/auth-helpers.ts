import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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

/**
 * 사용자 소유의 BrokerageAccount 인지 확인 (IDOR 방어).
 * 변이 핸들러에서 accountId 를 받기 전에 반드시 호출.
 *
 * @returns 소유 확인된 account, 또는 null (존재하지 않거나 타 사용자 소유)
 */
export async function assertAccountOwnership(
    accountId: string,
    userId: string,
): Promise<{ id: string; userId: string; name: string } | null> {
    const account = await prisma.brokerageAccount.findFirst({
        where: { id: accountId, userId },
        select: { id: true, userId: true, name: true },
    })
    return account
}

/**
 * 사용자 소유의 Holding 인지 확인 (IDOR 방어).
 * /api/holdings/[id] PATCH/DELETE 등에서 사용.
 */
export async function assertHoldingOwnership(
    holdingId: string,
    userId: string,
): Promise<{ id: string; userId: string; accountId: string; stockId: string } | null> {
    const holding = await prisma.holding.findFirst({
        where: { id: holdingId, userId },
        select: { id: true, userId: true, accountId: true, stockId: true },
    })
    return holding
}
