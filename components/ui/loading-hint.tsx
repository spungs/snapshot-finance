'use client'

import { useEffect, useState } from 'react'

// 로딩이 길어질 때 사용자에게 "무엇을 하고 있는지" 단계적으로 알리는 힌트.
// - 0~1.5초: 표시 안 함 (대부분 사용자는 못 느낌)
// - 1.5초 후:  stage1 (예: "보유 종목 시세를 가져오는 중...")
// - 3초 후:    stage2 (예: "조금만 더 기다려 주세요")
// Skeleton 이 unmount 될 때 (= 데이터 도달) 함께 사라진다.

interface LoadingHintProps {
    stage1?: string
    stage2?: string
}

const DEFAULT_STAGE1 = '데이터를 가져오는 중...'
const DEFAULT_STAGE2 = '조금만 더 기다려 주세요'

export function LoadingHint({
    stage1 = DEFAULT_STAGE1,
    stage2 = DEFAULT_STAGE2,
}: LoadingHintProps = {}) {
    const [stage, setStage] = useState<0 | 1 | 2>(0)

    useEffect(() => {
        const t1 = setTimeout(() => setStage(1), 1500)
        const t2 = setTimeout(() => setStage(2), 3000)
        return () => {
            clearTimeout(t1)
            clearTimeout(t2)
        }
    }, [])

    if (stage === 0) return null

    const text = stage === 2 ? stage2 : stage1
    return (
        <div
            // key 로 단계 전환 시 fade-in 다시 트리거
            key={stage}
            className="px-6 pt-3 pb-1 text-[12px] text-muted-foreground text-center animate-fade-in"
            aria-live="polite"
        >
            {text}
        </div>
    )
}
