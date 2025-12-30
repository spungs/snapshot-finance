'use client'

import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'
import { getGuideBySlug, getGuideContent, guides } from '@/lib/guides/content'

export default function GuideDetailPage() {
    const { language } = useLanguage()
    const t = translations[language]
    const params = useParams()
    const slug = params.slug as string

    const guide = getGuideBySlug(slug)

    if (!guide) {
        notFound()
    }

    const { title, content } = getGuideContent(guide, language)

    // Find prev/next guides for navigation
    const currentIndex = guides.findIndex(g => g.slug === slug)
    const prevGuide = currentIndex > 0 ? guides[currentIndex - 1] : null
    const nextGuide = currentIndex < guides.length - 1 ? guides[currentIndex + 1] : null

    return (
        <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">
                <article className="container max-w-3xl px-4 md:px-6 py-12 md:py-16 mx-auto">
                    <div className="mb-8">
                        <Link href="/guides" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {language === 'ko' ? '가이드 목록' : 'Back to Guides'}
                        </Link>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                                <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <span className="text-sm text-muted-foreground">
                                {language === 'ko' ? '투자 가이드' : 'Investment Guide'}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight md:text-4xl mb-4">
                            {title}
                        </h1>
                    </div>

                    <div className="prose prose-gray dark:prose-invert max-w-none">
                        {content.split('\n\n').map((paragraph, index) => {
                            if (paragraph.startsWith('## ')) {
                                return (
                                    <h2 key={index} className="text-2xl font-bold mt-8 mb-4">
                                        {paragraph.replace('## ', '')}
                                    </h2>
                                )
                            }
                            if (paragraph.startsWith('### ')) {
                                return (
                                    <h3 key={index} className="text-xl font-semibold mt-6 mb-3">
                                        {paragraph.replace('### ', '')}
                                    </h3>
                                )
                            }
                            if (paragraph.startsWith('- ')) {
                                const items = paragraph.split('\n').filter(line => line.startsWith('- '))
                                return (
                                    <ul key={index} className="list-disc pl-6 space-y-2 my-4">
                                        {items.map((item, i) => (
                                            <li key={i}>{item.replace('- ', '')}</li>
                                        ))}
                                    </ul>
                                )
                            }
                            if (paragraph.startsWith('|')) {
                                const rows = paragraph.split('\n').filter(line => line.trim())
                                if (rows.length < 2) return null
                                const headers = rows[0].split('|').filter(cell => cell.trim())
                                const dataRows = rows.slice(2) // Skip header and separator
                                return (
                                    <div key={index} className="overflow-x-auto my-6">
                                        <table className="w-full border-collapse border border-muted">
                                            <thead>
                                                <tr className="bg-muted/50">
                                                    {headers.map((header, i) => (
                                                        <th key={i} className="border border-muted px-4 py-2 text-left font-semibold">
                                                            {header.trim()}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dataRows.map((row, i) => (
                                                    <tr key={i}>
                                                        {row.split('|').filter(cell => cell.trim()).map((cell, j) => (
                                                            <td key={j} className="border border-muted px-4 py-2">
                                                                {cell.trim()}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            }
                            if (paragraph.trim()) {
                                return (
                                    <p key={index} className="text-base leading-relaxed text-foreground/90 my-4">
                                        {paragraph.split('**').map((part, i) =>
                                            i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                                        )}
                                    </p>
                                )
                            }
                            return null
                        })}
                    </div>

                    {/* Disclaimer */}
                    <div className="mt-12 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground text-center break-keep">
                        {t.landing.investmentDisclaimer}
                    </div>

                    {/* Navigation */}
                    <div className="mt-8 pt-8 border-t flex flex-col sm:flex-row justify-between gap-4">
                        {prevGuide ? (
                            <Link href={`/guides/${prevGuide.slug}`} className="flex-1">
                                <Button variant="outline" className="w-full justify-start gap-2">
                                    <ArrowLeft className="h-4 w-4" />
                                    <span className="truncate">{getGuideContent(prevGuide, language).title}</span>
                                </Button>
                            </Link>
                        ) : <div className="flex-1" />}
                        {nextGuide && (
                            <Link href={`/guides/${nextGuide.slug}`} className="flex-1">
                                <Button variant="outline" className="w-full justify-end gap-2">
                                    <span className="truncate">{getGuideContent(nextGuide, language).title}</span>
                                    <ArrowLeft className="h-4 w-4 rotate-180" />
                                </Button>
                            </Link>
                        )}
                    </div>
                </article>
            </main>
            <SiteFooter />
        </div >
    )
}
