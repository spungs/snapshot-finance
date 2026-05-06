'use client'

import { useEffect, useState } from 'react'

// 로딩이 길어질 때 사용자에게 "무엇을 하고 있는지" 단계적으로 알리는 힌트.
// - 0~1.5초: 표시 안 함 (대부분 사용자는 못 느낌)
// - 1.5초 후: 첫 메시지 표시
// - 이후 cycleMs 간격으로 메시지 풀을 순환 (key 기반 fade-in 으로 자연스러운 전환)
// - Skeleton 이 unmount 될 때 (= 데이터 도달) 함께 사라진다.

interface LoadingHintProps {
    messages?: string[]
    /** 첫 메시지 표시까지 대기 시간 (ms). 기본 1500. */
    showAfterMs?: number
    /** 메시지 간 전환 간격 (ms). 기본 2500. */
    cycleMs?: number
}

const DEFAULT_MESSAGES = [
    '데이터를 가져오는 중...',
    '거의 다 됐어요',
    '조금만 더 기다려 주세요',
]

export function LoadingHint({
    messages = DEFAULT_MESSAGES,
    showAfterMs = 1500,
    cycleMs = 2500,
}: LoadingHintProps = {}) {
    const [index, setIndex] = useState(0)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        let cycleTimer: ReturnType<typeof setInterval> | null = null
        const showTimer = setTimeout(() => {
            setVisible(true)
            cycleTimer = setInterval(() => {
                setIndex((i) => (i + 1) % messages.length)
            }, cycleMs)
        }, showAfterMs)
        return () => {
            clearTimeout(showTimer)
            if (cycleTimer) clearInterval(cycleTimer)
        }
    }, [showAfterMs, cycleMs, messages.length])

    if (!visible || messages.length === 0) return null

    return (
        <div
            // key 로 메시지 전환 시 fade-in 다시 트리거
            key={index}
            className="px-6 pt-3 pb-1 text-[12px] text-muted-foreground text-center animate-fade-in"
            aria-live="polite"
        >
            {messages[index]}
        </div>
    )
}
