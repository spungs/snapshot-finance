'use client'

import { useSyncExternalStore } from 'react'

export type TextScale = 'normal' | 'large' | 'xlarge'

/**
 * 사람의 취향이므로 포트폴리오가 바뀌어도 유지한다.
 * → lib/portfolio-scoped-cache.ts 의 폐기 목록에 넣지 말 것.
 */
export const TEXT_SCALE_STORAGE_KEY = 'textScale'

/**
 * 루트 font-size(px). 앱의 모든 텍스트가 rem 이라 이 한 값이 전체 글자 크기를 정한다.
 * 컨테이너 폭(max-w-[480px])과 차트 높이(h-[300px])는 px 로 남겨두었으므로
 * 글자만 커지고 레이아웃 골격은 유지된다.
 *
 * ⚠️ 이 표를 바꾸면 app/layout.tsx 의 FOUC 방지 인라인 스크립트도 함께 고칠 것.
 *    (스크립트는 hydration 전에 실행돼야 해서 이 모듈을 import 할 수 없다.)
 */
export const TEXT_SCALE_PX: Record<TextScale, number> = {
    normal: 16,
    large: 18,
    xlarge: 20,
}

function isTextScale(v: unknown): v is TextScale {
    return v === 'normal' || v === 'large' || v === 'xlarge'
}

// localStorage 를 외부 스토어로 다루고 useSyncExternalStore 로 구독한다.
// Provider 도 effect 도 필요 없다 — 실제 적용(루트 font-size)은 layout 의 인라인
// 스크립트가 페인트 전에 이미 끝냈고, React 는 "지금 어느 값인지" 만 읽으면 된다.
let listeners: Array<() => void> = []

function subscribe(onChange: () => void) {
    listeners.push(onChange)
    return () => {
        listeners = listeners.filter((l) => l !== onChange)
    }
}

function getSnapshot(): TextScale {
    try {
        const saved = localStorage.getItem(TEXT_SCALE_STORAGE_KEY)
        return isTextScale(saved) ? saved : 'normal'
    } catch {
        return 'normal'
    }
}

// SSR·hydration 시점 값. 인라인 스크립트가 DOM 을 이미 고쳐놨으므로
// 여기서 'normal' 을 돌려줘도 화면이 튀지 않는다(설정 화면의 선택 표시만 뒤늦게 맞춰짐).
function getServerSnapshot(): TextScale {
    return 'normal'
}

export function useTextScale() {
    const textScale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    const setTextScale = (scale: TextScale) => {
        document.documentElement.style.fontSize = `${TEXT_SCALE_PX[scale]}px`
        try {
            localStorage.setItem(TEXT_SCALE_STORAGE_KEY, scale)
        } catch {
            /* 저장 실패해도 이번 세션에는 적용된다 */
        }
        for (const l of listeners) l()
    }

    return { textScale, setTextScale }
}
