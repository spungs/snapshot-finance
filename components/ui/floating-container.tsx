'use client'

import { useEffect, useState } from 'react'

// 하단 탭바(BottomTabBar) 높이 + 시각 여백. 탭바는 약 56-64px 높이이며 safe-area는
// 탭바 내부에서 처리하므로 여기서는 별도로 더하지 않는다.
// FloatingContainer 안에 들어가는 액션(예: AI chat)은 페이지 자체 + FAB 위에 위치한다 —
// 탭바 위 12px(FAB_GAP) + FAB 높이(48px) + 12px(GAP) = 가까운 액션이 아래, 보조 액션이 위.
const BOTTOM_TAB_BAR_HEIGHT = 64
const FAB_GAP = 12
const PAGE_FAB_SIZE = 48

export function FloatingContainer({ children }: { children: React.ReactNode }) {
    const [bottomOffset, setBottomOffset] = useState(0)
    const [hasBottomTab, setHasBottomTab] = useState(false)

    useEffect(() => {
        const update = () => {
            const tab = document.querySelector('nav[aria-label="Primary"]')
            setHasBottomTab(!!tab)

            const footer = document.querySelector('footer')
            if (!footer) {
                setBottomOffset(0)
                return
            }

            const footerRect = footer.getBoundingClientRect()
            const windowHeight = window.innerHeight

            if (footerRect.top < windowHeight) {
                const visibleFooterHeight = windowHeight - footerRect.top
                setBottomOffset(visibleFooterHeight)
            } else {
                setBottomOffset(0)
            }
        }

        window.addEventListener('scroll', update, { passive: true })
        window.addEventListener('resize', update, { passive: true })
        update()

        const observer = new MutationObserver(update)
        observer.observe(document.body, { childList: true, subtree: true })

        return () => {
            window.removeEventListener('scroll', update)
            window.removeEventListener('resize', update)
            observer.disconnect()
        }
    }, [])

    // 탭바가 있으면 페이지 FAB(아래) 위쪽 슬롯에 둔다. 페이지 FAB이 없는 화면에서도
    // 시각 위치를 일관되게 유지하기 위해 동일한 수직 좌표를 쓴다.
    const baseBottom = hasBottomTab
        ? `calc(${BOTTOM_TAB_BAR_HEIGHT + FAB_GAP + PAGE_FAB_SIZE + FAB_GAP}px + var(--safe-bottom, 0px))`
        : `calc(1rem + var(--safe-bottom, 0px))`

    return (
        <div
            className="fixed right-4 z-50 flex flex-col gap-4 items-end pointer-events-none transition-transform duration-75"
            style={{
                bottom: baseBottom,
                transform: `translateY(-${bottomOffset}px)`,
            }}
        >
            <div className="flex flex-col gap-4 pointer-events-auto">
                {children}
            </div>
        </div>
    )
}
