'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { guides, getGuideContent } from '@/lib/guides/content'

export default function GuidesPage() {
    const { language } = useLanguage()
    const t = translations[language]

    return (
        <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">
                <section className="w-full py-12 md:py-24 lg:py-32 bg-gradient-to-b from-background to-muted/50">
                    <div className="container px-4 md:px-6 mx-auto">
                        <div className="flex flex-col items-center space-y-4 text-center mb-12">
                            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                                <BookOpen className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                                {t.landing.guidesTitle}
                            </h1>
                            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                                {t.landing.guidesDesc}
                            </p>
                        </div>

                        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6">
                            {guides.map((guide) => {
                                const { title, description } = getGuideContent(guide, language)
                                return (
                                    <Link key={guide.slug} href={`/guides/${guide.slug}`}>
                                        <Card className="flex flex-col p-6 border shadow-sm hover:shadow-lg transition-all hover:border-primary/50 cursor-pointer group">
                                            <CardHeader className="p-0 pb-3">
                                                <CardTitle className="text-xl group-hover:text-primary transition-colors flex items-center justify-between">
                                                    {title}
                                                    <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                <CardDescription className="text-base leading-relaxed">
                                                    {description}
                                                </CardDescription>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                )
                            })}
                        </div>

                        <div className="mt-12 text-center">
                            <Link href="/">
                                <Button variant="outline" className="gap-2">
                                    <ArrowLeft className="h-4 w-4" />
                                    {t.terms.goToMain}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    )
}
