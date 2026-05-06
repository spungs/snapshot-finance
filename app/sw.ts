/// <reference lib="webworker" />
// Service Worker — Serwist 가 빌드 시 컴파일해 public/sw.js 로 생성한다.
// 콜드 스타트 시 캐시에서 즉시 반환 → 검은 화면 단축.
//
// 캐시 전략 (defaultCache 위에 navigation 만 오버라이드):
// - navigation (HTML 페이지): StaleWhileRevalidate — 캐시가 있으면 즉시 반환
//   하고 백그라운드에서 fresh fetch 후 캐시 갱신. 첫 페인트가 거의 즉각.
//   (defaultCache 의 NetworkFirst 는 콜드 스타트 시 네트워크 응답을 기다림 → 검은 화면 길어짐)
// - 정적 asset (JS/CSS/이미지/폰트): defaultCache 의 CacheFirst, 장기 보관
// - API/Server Action: defaultCache 의 NetworkOnly — 인증/데이터 항상 fresh
//
// 단점: 캐시 stale 상태에서 잠깐 이전 데이터가 보일 수 있음 (예: 로그아웃 직후
// 캐시된 dashboard 가 잠깐 보였다가 redirect). UX 상 무시 가능 수준.

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, StaleWhileRevalidate } from 'serwist'

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    }
}

declare const self: ServiceWorkerGlobalScope

// defaultCache 에서 navigation 매처를 제거하고 StaleWhileRevalidate 로 교체.
// (defaultCache 첫 항목이 navigation 핸들러)
const customCache = [
    {
        matcher: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
            sameOrigin && request.mode === 'navigate',
        handler: new StaleWhileRevalidate({
            cacheName: 'pages',
            plugins: [],
        }),
    },
    ...defaultCache,
]

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: customCache,
})

serwist.addEventListeners()
