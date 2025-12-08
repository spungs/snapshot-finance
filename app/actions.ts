'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function toggleAutoSnapshot(accountId: string, enabled: boolean) {
    try {
        await prisma.securitiesAccount.update({
            where: { id: accountId },
            data: { isAutoSnapshotEnabled: enabled },
        })
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('Failed to toggle auto snapshot:', error)
        return { success: false, error: 'Failed to update settings' }
    }
}
