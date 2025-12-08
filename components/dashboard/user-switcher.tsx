'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function UserSwitcher() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentUserId = searchParams.get('userId') || 'test-user-free'

    const handleValueChange = (value: string) => {
        const params = new URLSearchParams(searchParams)
        params.set('userId', value)
        router.push(`?${params.toString()}`)
    }

    return (
        <div className="w-[180px]">
            <Select value={currentUserId} onValueChange={handleValueChange}>
                <SelectTrigger>
                    <SelectValue placeholder="Select User" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="test-user-free">Free User</SelectItem>
                    <SelectItem value="test-user-pro">Pro User</SelectItem>
                    <SelectItem value="test-user-max">Max User</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}
