'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'

export async function toggleAutoSnapshot(enabled: boolean) {
    const session = await auth()
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' }
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
    // Force clear session cookies for Netlify compatibility
    const cookieStore = await cookies()
    cookieStore.getAll().forEach((cookie) => {
        if (cookie.name.includes('authjs') || cookie.name.includes('next-auth')) {
            cookieStore.delete(cookie.name)
        }
    })

    await signOut({ redirectTo: '/' })
}

export async function googleLogin() {
    await signIn('google', { redirectTo: '/dashboard' }, { prompt: 'login select_account' })
}

export async function updateTargetAsset(amount: number) {
    const session = await auth()
    if (!session?.user?.id) {
        throw new Error("Unauthorized")
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { targetAsset: amount },
        })
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('Failed to update target asset:', error)
        return { success: false, error: 'Failed to update target asset' }
    }
}
