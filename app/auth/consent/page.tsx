import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ConsentForm } from './consent-form'

export default async function ConsentPage() {
    const session = await auth()
    if (!session?.user?.id) {
        redirect('/auth/signin')
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { agreedAt: true },
    })
    if (user?.agreedAt) {
        redirect('/dashboard')
    }

    return (
        <div className="flex items-center justify-center min-h-[100dvh] bg-gray-100 dark:bg-gray-900 p-4">
            <ConsentForm />
        </div>
    )
}
