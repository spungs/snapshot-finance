/// <reference lib="webworker" />
// Service Worker — Serwist 가 빌드 시 컴파일해 public/sw.js 로 생성한다.
// 콜드 스타트 시 HTML/JS/CSS/이미지를 캐시에서 즉시 반환 → 검은 화면 단축.
//
// 캐시 전략 (defaultCache 의 기본값):
// - 정적 asset (JS/CSS/이미지/폰트): CacheFirst, 장기 보관
// - 페이지 (navigation): NetworkFirst with timeout — 네트워크가 빠르면 fresh,
//   느리면 캐시 fallback. 인증 변경(로그아웃 등)이 즉시 반영되도록.
// - API/Server Action: NetworkOnly (캐시 안 함) — 인증/데이터 항상 fresh.
//
// CHANGELOG: 캐시 깨고 싶으면 SW 버전 올리거나 (skipWaiting=true) clients claim.

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
