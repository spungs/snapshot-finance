import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SettingsClient } from './settings-client'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  return (
    <SettingsClient
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        isAutoSnapshotEnabled: session.user.isAutoSnapshotEnabled,
      }}
    />
  )
}
