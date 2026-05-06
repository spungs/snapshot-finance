import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const session = await auth()
  if (session?.user?.id) {
    redirect('/dashboard')
  }
  redirect('/auth/signin')
}
