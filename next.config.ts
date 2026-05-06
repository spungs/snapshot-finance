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
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Next.js 16 RSC 클라이언트 캐시 유지 시간.
  // 동일 라우트로 30초 안에 돌아오면 SSR 재실행 없이 캐시된 RSC 즉시 사용 →
  // 홈 → 보유 → 홈 같은 토글 시 skeleton flash 제거. force-dynamic 페이지에도 적용됨.
  // https://nextjs.org/docs/app/api-reference/next-config-js/staleTimes
  experimental: {
    staleTimes: {
      dynamic: 30,
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
