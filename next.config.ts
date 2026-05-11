import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const securityHeaders = [
  // 클릭재킹 방지
  { key: "X-Frame-Options", value: "DENY" },
  // MIME 스니핑 방지
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer 정책
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 브라우저 권한 차단
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // CSP는 인라인 스크립트/스타일 호환성 검증 후 별도 도입 (Report-Only로 우선 운영 권장)
];

// PWA Service Worker — app/sw.ts 를 컴파일해 public/sw.js 로 출력.
// 개발 모드에서는 자동 비활성화 (캐시 디버깅 혼란 방지).
//
// exclude 패턴: iOS splash 40개는 디바이스마다 1개만 사용되므로 SW precache 에
// 모두 미리 다운로드하면 39개가 낭비. iOS 자체 캐시가 처리하므로 SW 에서 제외.
// (정적 asset 제외 → Hobby 100GB/월 대역폭 절약)
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  // iOS apple-touch-startup-image — 디바이스마다 1개만 사용. iOS 자체 캐시
  // 가 처리하므로 SW precache 에서 모두 제외해 install 대역폭 절약.
  // globPublicPatterns: precache 할 public/ 파일 패턴 (기본 ["**/*"]).
  // splash/** 만 빠지도록 명시적으로 다른 패턴 나열.
  globPublicPatterns: [
    'icons/**',
    'favicon.*',
    '*.svg',
    'logo.*',
    'manifest.*',
    'robots.txt',
    'ads.txt',
  ],
});

const nextConfig: NextConfig = {
  // Turbopack 사용 명시 (next dev 기본). @serwist/next 가 주입하는 webpack config 와
  // 의도된 공존임을 알려 dev 시작 시 경고 silence.
  // - dev: Turbopack (빠른 HMR)
  // - build: package.json 의 "next build --webpack" 그대로 (Serwist PWA 정상 작동)
  turbopack: {},

  // Next.js 16 RSC 클라이언트 캐시 유지 시간.
  // dynamic: 0 — CUD (계좌 추가/삭제/이름변경, 종목 변이) 결과가 다른 페이지로 이동
  // 후 돌아왔을 때 즉시 반영되도록 client RSC cache 비활성. trade-off 로 동일 라우트
  // 토글(홈↔보유) 시 skeleton flash 가능. 정확성 우선.
  // https://nextjs.org/docs/app/api-reference/next-config-js/staleTimes
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSerwist(nextConfig);
