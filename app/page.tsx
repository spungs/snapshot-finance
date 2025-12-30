'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, Camera, LineChart, ShieldCheck, TrendingUp } from 'lucide-react'
import { MobileNav } from '@/components/mobile-nav'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

export default function Home() {
  const { language } = useLanguage()
  const t = translations[language]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 lg:px-6 h-14 flex items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 justify-between">
        <Link className="flex items-center justify-center font-bold text-xl" href="#">
          <Camera className="mr-2 h-6 w-6" />
          Snapshot Finance
        </Link>
        <nav className="hidden sm:flex ml-auto gap-4 sm:gap-6 items-center">
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="#about">
            {t.landing.about}
          </Link>
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="#features">
            {t.landing.features}
          </Link>
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="/guides">
            {t.landing.guides}
          </Link>
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="/dashboard/what-if">
            {(t as any).whatIf}
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              {t.landing.login}
            </Button>
          </Link>
        </nav>
        <MobileNav type="landing" />
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-gradient-to-b from-background to-muted/50">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-4">
                <div className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
                  {t.landing.projectBuiltForSelf}
                </div>
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none text-balance break-keep">
                  {t.landing.heroTitle}
                </h1>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl leading-relaxed text-balance break-keep">
                  {t.landing.heroDesc}
                </p>
              </div>
              <div className="space-x-4 pt-6">
                <Link href="/dashboard">
                  <Button className="h-11 px-8 rounded-full text-lg" size="lg">
                    {t.landing.recordPortfolio} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
                  {t.landing.essentialFeatures}
                </h2>
                <p className="max-w-[700px] text-muted-foreground md:text-lg text-balance break-keep">
                  {t.landing.simpleDesc}
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              <Card className="flex flex-col items-center text-center p-6 border-none shadow-lg bg-card/50 backdrop-blur-sm transition-all hover:scale-105">
                <CardHeader className="p-0 pb-4 flex flex-col items-center">
                  <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Camera className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </CardHeader>
                <CardContent className="p-0 space-y-2">
                  <CardTitle>{t.landing.feature1Title}</CardTitle>
                  <CardDescription className="text-base pt-2 text-balance break-keep">
                    {t.landing.feature1Desc}
                  </CardDescription>
                </CardContent>
              </Card>
              <Card className="flex flex-col items-center text-center p-6 border-none shadow-lg bg-card/50 backdrop-blur-sm transition-all hover:scale-105">
                <CardHeader className="p-0 pb-4 flex flex-col items-center">
                  <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                    <LineChart className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                </CardHeader>
                <CardContent className="p-0 space-y-2">
                  <CardTitle>{t.landing.feature2Title}</CardTitle>
                  <CardDescription className="text-base pt-2 text-balance break-keep">
                    {t.landing.feature2Desc}
                  </CardDescription>
                </CardContent>
              </Card>
              <Card className="flex flex-col items-center text-center p-6 border-none shadow-lg bg-card/50 backdrop-blur-sm transition-all hover:scale-105">
                <CardHeader className="p-0 pb-4 flex flex-col items-center">
                  <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/30">
                    <TrendingUp className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                  </div>
                </CardHeader>
                <CardContent className="p-0 space-y-2">
                  <CardTitle>{t.whatIf}</CardTitle>
                  <CardDescription className="text-base pt-2 text-balance break-keep">
                    {t.landing.guide4Desc}
                  </CardDescription>
                </CardContent>
              </Card>
              <Card className="flex flex-col items-center text-center p-6 border-none shadow-lg bg-card/50 backdrop-blur-sm transition-all hover:scale-105">
                <CardHeader className="p-0 pb-4 flex flex-col items-center">
                  <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                    <ShieldCheck className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                  </div>
                </CardHeader>
                <CardContent className="p-0 space-y-2">
                  <CardTitle>{t.landing.feature3Title}</CardTitle>
                  <CardDescription className="text-base pt-2 text-balance break-keep">
                    {t.landing.feature3Desc}
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="w-full py-12 md:py-24 lg:py-32 bg-muted/30 border-t">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center justify-center space-y-6 text-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
                  {t.landing.tryNow}
                </h2>
                <p className="mx-auto max-w-[600px] text-muted-foreground md:text-lg text-balance break-keep">
                  {t.landing.freeDesc}
                </p>
              </div>
              <div className="flex flex-col gap-3 min-[400px]:flex-row pt-4">
                <Link href="/dashboard">
                  <Button className="px-8 h-10" size="lg">
                    {t.landing.easyStart}
                  </Button>
                </Link>
              </div>

              <div className="pt-8 max-w-[600px] text-sm text-balance break-keep text-muted-foreground/80">
                <p dangerouslySetInnerHTML={{ __html: t.landing.feedbackNote.replace('email', '<a href="mailto:spungs.dev@gmail.com" class="underline hover:text-foreground">email</a>').replace('이메일', '<a href="mailto:spungs.dev@gmail.com" class="underline hover:text-foreground">이메일</a>') }} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">
          {t.landing.copyRight}
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4 text-muted-foreground" href="/terms">
            {t.landing.termsOfService || '이용약관'}
          </Link>
          <Link className="text-xs hover:underline underline-offset-4 text-muted-foreground" href="/privacy">
            {t.landing.privacyPolicy}
          </Link>
        </nav>
      </footer>
    </div>
  )
}
