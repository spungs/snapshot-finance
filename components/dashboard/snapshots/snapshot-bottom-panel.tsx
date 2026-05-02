'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/lib/i18n/context'
import { SnapshotDiff } from './snapshot-diff'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    currentHoldings: any[]
    snapshots: any[]
    selectedIds: string[]
    onClearSelection: () => void
}

// 비교 패널 — modal=false / dismissible=false로 쓰던 vaul Drawer를 일반 fixed div로 교체.
// vaul Drawer는 첫 mount 시 transform 0 → 목표 위치로 트랜지션돼 "보였다가 내려감" 결함이
// 발생했고, 일부 환경에서 body scroll lock이 잡혀 뒤쪽 페이지가 스크롤되지 않는 문제도 있었음.
export function SnapshotBottomPanel({ currentHoldings, snapshots, selectedIds, onClearSelection }: Props) {
    const { t } = useLanguage()
    const [expanded, setExpanded] = useState(false)
    const [mounted, setMounted] = useState(false)

    const isOpen = selectedIds.length > 0
    const isExpanded = expanded

    useEffect(() => {
        setMounted(true)
    }, [])

    // 선택 개수가 변할 때마다 expand 상태로 리셋 — 1개든 2개든 사용자가 결과/안내를 즉시
    // 볼 수 있게 한다. 헤더 탭으로 collapse 가능, X 버튼으로 완전히 닫을 수 있다.
    useEffect(() => {
        setExpanded(selectedIds.length > 0)
    }, [selectedIds.length])

    if (!isOpen || !mounted) return null

    // createPortal로 body 직접 mount — 페이지 안의 transformed 컨테이너가
    // fixed positioning의 containing block을 가로채는 것을 회피한다.
    return createPortal(
        <>
            {/* dimmed background — 클릭은 통과 */}
            <div
                aria-hidden
                className={cn(
                    'fixed inset-0 z-40 bg-black/20 pointer-events-none transition-opacity duration-300',
                    isExpanded ? 'opacity-100' : 'opacity-0',
                )}
            />
            <section
                role="dialog"
                aria-label={t('portfolioComparison')}
                className={cn(
                    'fixed bottom-0 left-0 right-0 z-50',
                    'flex flex-col bg-background border-t shadow-lg',
                    'max-h-[85dvh] md:max-h-[70dvh]',
                    'rounded-t-[1.5rem] md:rounded-t-xl',
                    'transition-transform duration-300 ease-out',
                )}
                style={{
                    transform: isExpanded ? 'translateY(0)' : 'translateY(calc(100% - 64px))',
                }}
            >
                {/* 핸들 / 헤더 — 탭하면 expand 토글 */}
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    className="sticky top-0 z-10 bg-background border-b w-full text-left hover:bg-muted/50 transition-colors"
                    aria-expanded={isExpanded}
                >
                    <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto md:hidden" />
                            <h3 className="font-semibold text-sm md:text-base">
                                {t('portfolioComparison')}
                                <span className="ml-2 text-xs text-muted-foreground">
                                    ({selectedIds.length} {t('countUnit')})
                                </span>
                            </h3>
                        </div>
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={e => {
                                e.stopPropagation()
                                onClearSelection()
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onClearSelection()
                                }
                            }}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0 inline-flex items-center justify-center cursor-pointer"
                            aria-label={t('hideComparison')}
                        >
                            <X className="w-4 h-4" />
                        </span>
                    </div>
                </button>

                {/* 비교 내용 — 1개 선택 시 안내, 2개일 때만 실제 비교 표시 */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="p-4">
                        {selectedIds.length === 1 ? (
                            <SelectOneMore />
                        ) : (
                            <SnapshotDiff
                                currentHoldings={currentHoldings}
                                snapshots={snapshots}
                                selectedIds={selectedIds}
                            />
                        )}
                    </div>
                </div>
            </section>
        </>,
        document.body,
    )
}

function SelectOneMore() {
    const { t, language } = useLanguage()
    return (
        <div className="py-8 text-center">
            <div className="text-sm font-semibold text-foreground mb-1">
                {language === 'ko' ? '한 개 더 선택해주세요' : 'Select one more snapshot'}
            </div>
            <div className="text-xs text-muted-foreground">
                {language === 'ko'
                    ? `두 스냅샷을 선택하면 ${t('portfolioComparison')}을 볼 수 있어요`
                    : 'Pick two snapshots to compare side-by-side'}
            </div>
        </div>
    )
}
