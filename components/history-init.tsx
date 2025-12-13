'use client'

if (typeof window !== 'undefined') {
    const w = window as any
    if (typeof w.__base_history_len === 'undefined') {
        w.__base_history_len = window.history.length
    }
}

export function HistoryInit() {
    return null
}
