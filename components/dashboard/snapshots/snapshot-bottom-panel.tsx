'use client'

import { Drawer } from 'vaul'
import { useLanguage } from '@/lib/i18n/context'
import { SnapshotDiff } from './snapshot-diff'
import { ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    currentHoldings: any[]
    snapshots: any[]
    selectedIds: string[]
    onClearSelection: () => void
}

export function SnapshotBottomPanel({ currentHoldings, snapshots, selectedIds, onClearSelection }: Props) {
    const { t } = useLanguage()

    // 선택된 스냅샷 개수에 따라 열림/닫힘 상태 결정
    const isOpen = selectedIds.length > 0
    const isPeekMode = selectedIds.length === 1
    const isExpanded = selectedIds.length === 2

    // 선택이 없으면 아예 렌더링하지 않음 (Hydration 에러 방지)
    if (!isOpen) {
        return null
    }

    return (
        <Drawer.Root
            open={true}
            modal={false}
            dismissible={false}
        >
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/20 pointer-events-none" />
                <Drawer.Content
                    className={cn(
                        "fixed bottom-0 left-0 right-0 z-50",
                        "flex flex-col bg-background border-t shadow-lg",
                        "max-h-[85vh] md:max-h-[70vh]",
                        // 모바일에서는 둥근 모서리
                        "rounded-t-[1.5rem] md:rounded-t-xl",
                        // 애니메이션
                        "transition-all duration-300 ease-out"
                    )}
                    style={{
                        // peek 모드일 때는 약간만 올라옴
                        transform: isPeekMode && !isExpanded
                            ? 'translateY(calc(100% - 80px))'
                            : 'translateY(0)'
                    }}
                >
                    {/* 드래그 핸들 */}
                    <div className="sticky top-0 z-10 bg-background border-b">
                        <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto md:hidden" />
                                <ChevronUp className="w-5 h-5 text-muted-foreground hidden md:block" />
                                <Drawer.Title asChild>
                                    <h3 className="font-semibold text-sm md:text-base">
                                        {t('portfolioComparison')}
                                        {selectedIds.length > 0 && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                ({selectedIds.length} {t('countUnit')})
                                            </span>
                                        )}
                                    </h3>
                                </Drawer.Title>
                            </div>
                            <button
                                className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0"
                                aria-label={t('hideComparison')}
                                onClick={onClearSelection}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* 비교 내용 */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                        <div className="p-4">
                            <SnapshotDiff
                                currentHoldings={currentHoldings}
                                snapshots={snapshots}
                                selectedIds={selectedIds}
                            />
                        </div>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
