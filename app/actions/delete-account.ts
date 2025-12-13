'use server'

import { auth, signOut } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function deleteAccount() {
    const session = await auth()

    if (!session?.user?.id) {
        throw new Error('Not authenticated')
    }

    try {
        // Delete user (Cascasding deletes will handle related data like Holdings, Accounts, Snapshots)
        await prisma.user.update({
            where: {
                id: session.user.id,
            },
            data: {
                deletedAt: new Date(),
            },
        })

        // Sign out is handled after this returns or we can do it here if redirect happens
        // However, signOut() in server action might throw redirect, so we should do it last
    } catch (error) {
        console.error('Failed to delete account:', error)
        throw new Error('Failed to delete account')
    }

    await signOut({ redirectTo: '/' })
}
