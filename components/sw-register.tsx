'use client'

import { useEffect } from 'react'

// Service Worker 수동 등록.
// Serwist 의 auto-register 가 Next.js 16 App Router 에서 안정적이지 않아
// 클라이언트에서 직접 navigator.serviceWorker.register('/sw.js') 호출.
// 마운트 직후 1회 실행되며, 이미 등록되어 있으면 브라우저가 idempotent 처리.

export function SwRegister() {
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (!('serviceWorker' in navigator)) return

        // production 에서만 활성화 (next.config.ts 의 disable: dev 와 일치)
        if (process.env.NODE_ENV !== 'production') return

        const onLoad = () => {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/' })
                .then((reg) => {
                    if (process.env.NODE_ENV === 'development') {
                        console.log('[SW] registered:', reg.scope)
                    }
                })
                .catch((err) => {
                    console.warn('[SW] registration failed:', err)
                })
        }

        // window load 이후에 등록 — 초기 페인트 우선
        if (document.readyState === 'complete') {
            onLoad()
        } else {
            window.addEventListener('load', onLoad, { once: true })
            return () => window.removeEventListener('load', onLoad)
        }
    }, [])

    return null
}
