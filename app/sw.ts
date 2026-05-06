/// <reference lib="webworker" />
// Service Worker — Serwist 가 빌드 시 컴파일해 public/sw.js 로 생성한다.
// 콜드 스타트 시 캐시에서 자산을 즉시 반환 → 검은 화면 단축.
//
// defaultCache 의 표준 전략 (변경 안 함):
// - navigation (HTML 페이지): NetworkFirst with timeout — 변이 후에도 즉시
//   fresh 응답을 받음. 네트워크 끊겼을 때만 캐시 fallback. (이전엔 우리가
//   StaleWhileRevalidate 로 오버라이드 했으나 mutation 후 stale 화면 문제로
//   업계 표준인 NetworkFirst 로 복귀.)
// - 정적 asset (JS/CSS/이미지/폰트): CacheFirst — 장기 보관, 즉시 반환.
// - API/Server Action: NetworkOnly — 인증/데이터 항상 fresh.
//
// Reference:
// - https://github.com/vercel/next.js/discussions/52024
// - https://blog.logrocket.com/nextjs-16-pwa-offline-support/

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: defaultCache,
})

serwist.addEventListeners()
