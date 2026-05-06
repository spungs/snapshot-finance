import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
