'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { canUseAutoSnapshot, SubscriptionPlan } from '@/lib/config/subscription'

interface SubscriptionStatusCardProps {
    plan: SubscriptionPlan
    snapshotCount: number
    limit: number
    isAutoSnapshotEnabled: boolean
    onToggleAutoSnapshot: (enabled: boolean) => void
    loading?: boolean
}

export function SubscriptionStatusCard({
    plan,
    snapshotCount,
    limit,
    isAutoSnapshotEnabled,
    onToggleAutoSnapshot,
    loading = false,
}: SubscriptionStatusCardProps) {
    const usagePercent = Math.min((snapshotCount / limit) * 100, 100)
    const canAuto = canUseAutoSnapshot(plan)

    const getPlanColor = (p: SubscriptionPlan) => {
        switch (p) {
            case 'MAX':
                return 'bg-purple-600 hover:bg-purple-700'
            case 'PRO':
                return 'bg-blue-600 hover:bg-blue-700'
            default:
                return 'bg-gray-500 hover:bg-gray-600'
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">내 구독 정보</CardTitle>
                <Badge className={getPlanColor(plan)}>{plan}</Badge>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Snapshot Usage */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">스냅샷 사용량</span>
                            <span className="font-medium">
                                {snapshotCount} / {limit}
                            </span>
                        </div>
                        <Progress value={usagePercent} className="h-2" />
                    </div>

                    {/* Auto Snapshot Toggle */}
                    <div className="flex items-center justify-between space-x-2 pt-2">
                        <div className="flex flex-col space-y-1">
                            <Label htmlFor="auto-snapshot" className="text-sm font-medium">
                                자동 스냅샷
                            </Label>
                            <span className="text-xs text-muted-foreground">
                                매일 자정에 자동으로 기록합니다.
                                {!canAuto && ' (Pro 이상)'}
                            </span>
                        </div>
                        <Switch
                            id="auto-snapshot"
                            checked={isAutoSnapshotEnabled}
                            onCheckedChange={onToggleAutoSnapshot}
                            disabled={!canAuto || loading}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
