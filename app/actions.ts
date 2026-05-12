'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { holdingService } from '@/lib/services/holding-service'
import { validateCashAmount } from '@/lib/validation/portfolio-input'

export async function toggleAutoSnapshot(enabled: boolean) {
    const session = await auth()
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' }
    }

    if (typeof enabled !== 'boolean') {
        return { success: false, error: 'Invalid input' }
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { isAutoSnapshotEnabled: enabled },
        })
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('Failed to toggle auto snapshot:', error)
        return { success: false, error: 'Failed to update settings' }
    }
}
// ... existing code ...
import { signOut, signIn } from '@/lib/auth'

import { cookies } from 'next/headers'

export async function logout() {
    const cookieStore = await cookies()
    cookieStore.getAll().forEach((cookie) => {
        if (cookie.name.includes('authjs') || cookie.name.includes('next-auth')) {
            cookieStore.delete(cookie.name)
        }
    })

    await signOut({ redirectTo: '/' })
}

export async function googleLogin() {
    // 동의는 OAuth 완료 후 /auth/consent 게이트에서 1회 수집한다 (User.agreedAt).
    await signIn('google', { redirectTo: '/dashboard' }, { prompt: 'login select_account' })
}

export async function updateTargetAsset(amount: number) {
    const session = await auth()
    if (!session?.user?.id) {
        throw new Error("Unauthorized")
    }

    // 음수, NaN, Infinity, Decimal(15,2) 한도 초과 모두 차단
    const validated = validateCashAmount(amount)
    if (!validated.ok) {
        return { success: false, error: validated.error }
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { targetAsset: validated.value },
        })
        await holdingService.invalidate(session.user.id)
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('Failed to update target asset:', error)
        return { success: false, error: 'Failed to update target asset' }
    }
}
