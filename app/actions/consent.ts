'use server'

import { auth, signOut } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export async function agreeToConsent() {
    const session = await auth()
    if (!session?.user?.id) {
        throw new Error('Unauthorized')
    }
    await prisma.user.update({
        where: { id: session.user.id },
        data: { agreedAt: new Date() },
    })
    redirect('/dashboard')
}

export async function declineConsent() {
    await signOut({ redirectTo: '/' })
}
