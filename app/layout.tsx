import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://snapshot-finance.netlify.app'),
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
};

import { LanguageProvider } from '@/lib/i18n/context'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { CurrencyProvider } from '@/lib/currency/context'



import { HistoryInit } from '@/components/history-init'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6002876774605337" crossOrigin="anonymous"></script>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div id="g_id_onload"
          data-client_id={process.env.GOOGLE_CLIENT_ID}
          data-login_uri={`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/auth/callback/google`}
          data-auto_prompt="false">
        </div>
        <HistoryInit />
        <LanguageProvider>
          <CurrencyProvider>
            {children}
            <LanguageSwitcher />
          </CurrencyProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
