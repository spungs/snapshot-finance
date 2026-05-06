import type { Metadata } from "next";
import { Source_Serif_4, Noto_Serif_KR, JetBrains_Mono } from "next/font/google";
import { APPLE_STARTUP_IMAGES } from '@/lib/ios-splash-images'
import "./globals.css";

// JetBrains Mono — matches design
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-jb",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

// Editorial serif for Latin glyphs (Charter alternative)
const sourceSerif = Source_Serif_4({
  variable: "--font-serif-latin",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

// Korean editorial serif (design uses system fallback; we add Noto Serif KR for richer Korean serif)
const notoSerifKr = Noto_Serif_KR({
  variable: "--font-serif-ko",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://snapshot-finance.vercel.app'),
  title: {
    default: "Snapshot Finance - 주식 포트폴리오 스냅샷 및 시뮬레이션",
    template: "%s | Snapshot Finance",
  },
  description: "주식 포트폴리오를 날짜별 스냅샷으로 기록하고, 실시간 가치 평가와 투자 시뮬레이션을 통해 체계적으로 자산을 관리하세요. 미국 주식, 한국 주식 통합 관리.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    title: "Snapshot Finance - 주식 포트폴리오 스냅샷 & 시뮬레이션",
    description: "복잡한 엑셀은 그만! 주식 포트폴리오를 날짜별로 기록하고, '만약에' 시뮬레이션으로 투자 성과를 분석하세요.",
    siteName: "Snapshot Finance",
  },
  twitter: {
    card: "summary_large_image",
    title: "Snapshot Finance - 주식 포트폴리오 관리의 새로운 기준",
    description: "주식 포트폴리오 스냅샷, 수익률 시뮬레이션, 배당금 관리까지 한 번에.",
  },
  robots: {
    index: true,
    follow: true,
  },
  // PWA 메타 — iOS standalone 모드에서 검은 화면 대신 브랜드 splash 표시
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Snapshot",
    startupImage: APPLE_STARTUP_IMAGES,
  },
};

import { LanguageProvider } from '@/lib/i18n/context'
import { CurrencyProvider } from '@/lib/currency/context'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

import { HistoryInit } from '@/components/history-init'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6002876774605337" crossOrigin="anonymous"></script>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body
        className={`${jetbrainsMono.variable} ${sourceSerif.variable} ${notoSerifKr.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <div id="g_id_onload"
            data-client_id={process.env.GOOGLE_CLIENT_ID}
            data-login_uri={`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/auth/callback/google`}
            data-auto_prompt="false">
          </div>
          <HistoryInit />
          <LanguageProvider>
            <CurrencyProvider>
              {children}
              <Toaster position="top-center" />
            </CurrencyProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
