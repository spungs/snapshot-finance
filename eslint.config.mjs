import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code 워크트리/세션 디렉터리 — repo 전체 사본이 들어 있어
    // (eslint 는 .gitignore 를 보지 않음) 중복 린트로 수십만 건 폭발하는 것을 차단.
    ".claude/**",
    // Vercel / next-on-pages 빌드 산출물 (.vercel/output 의 함수 번들은 >500KB 미니파이).
    ".vercel/**",
    // 중첩 빌드 산출물 (예: 워크트리 내부 .next) — 루트 ".next/**" 패턴은 중첩까지 못 잡음.
    "**/.next/**",
    // Serwist PWA 빌드 산출물 (미니파이 — 린트 대상 아님).
    "public/sw.js",
    "public/swe-worker-*.js",
    "public/workbox-*.js",
  ]),
]);

export default eslintConfig;
