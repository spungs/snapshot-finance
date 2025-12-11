'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

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
