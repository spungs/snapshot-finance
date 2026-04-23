'use client'

import { useEffect, useState } from 'react'

export function FloatingContainer({ children }: { children: React.ReactNode }) {
    const [bottomOffset, setBottomOffset] = useState(0)

    useEffect(() => {
        const handleScroll = () => {
            const footer = document.querySelector('footer')
            if (!footer) {
                setBottomOffset(0)
                return
            }
            
            const footerRect = footer.getBoundingClientRect()
            const windowHeight = window.innerHeight
            
            if (footerRect.top < windowHeight) {
                // 푸터가 보이기 시작하면, 보이는 만큼 오프셋을 계산합니다.
                const visibleFooterHeight = windowHeight - footerRect.top
                setBottomOffset(visibleFooterHeight)
            } else {
                setBottomOffset(0)
            }
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        window.addEventListener('resize', handleScroll, { passive: true })
        
        // 초기 로딩 시 체크
        handleScroll()
        
        // DOM 변경 시 높이 변화 감지 (예: 푸터 내부 콘텐츠 변경 시)
        const observer = new MutationObserver(handleScroll)
        observer.observe(document.body, { childList: true, subtree: true })
        
        return () => {
            window.removeEventListener('scroll', handleScroll)
            window.removeEventListener('resize', handleScroll)
            observer.disconnect()
        }
    }, [])

    return (
        <div 
            className="fixed right-4 z-50 flex flex-col gap-4 items-end pointer-events-none transition-transform duration-75"
            style={{ 
                bottom: '1rem',
                transform: `translateY(-${bottomOffset}px)`,
            }}
        >
            <div className="flex flex-col gap-4 pointer-events-auto">
                {children}
            </div>
        </div>
    )
}
