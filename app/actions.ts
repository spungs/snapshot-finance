'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'

export async function toggleAutoSnapshot(userId: string, enabled: boolean) {
    try {
        await prisma.user.update({
            where: { id: userId },
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
import { signOut } from '@/lib/auth'

export async function logout() {
    await signOut({ redirectTo: '/' })
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
