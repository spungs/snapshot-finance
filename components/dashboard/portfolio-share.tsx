'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Decimal from 'decimal.js'
import { toPng } from 'html-to-image'
import { toast } from 'sonner'
import { Share2, Loader2 } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'
import { useCurrency } from '@/lib/currency/context'
import { formatCurrency, formatNumber } from '@/lib/utils/formatters'

interface ShareHolding {
    id: string
    stockCode: string
    stockName: string
    quantity: number
    averagePrice: number
    currency: string
    purchaseRate: number
    totalCost: number
    currentValue: number
}

interface ShareSummary {
    totalCost: number
    totalValue: number
    cashBalance: number
    exchangeRate: number
}

interface Props {
    holdings: ShareHolding[]
    summary: ShareSummary
    userName: string | null | undefined
}

const SEGMENT_COLORS = [
    '#3b82f6', '#a855f7', '#10b981', '#ef4444', '#f59e0b',
    '#ec4899', '#06b6d4', '#8b5cf6', '#14b8a6', '#f97316',
    '#6366f1', '#84cc16',
]

/** 캡처 컨테이너 width(px) — 모바일 카톡 화면에서 보기 좋은 너비 */
const CARD_WIDTH = 480

/**
 * 포트폴리오 공유 버튼 — 현재 보유 종목을 PNG 이미지로 캡처해
 * 모바일에서는 OS 공유 시트(navigator.share)로, 데스크톱 등 미지원 환경에서는
 * PNG 다운로드로 폴백한다.
 *
 * 화면에 보이는 DOM을 캡처하면 인터랙션 요소(드롭다운/편집 버튼/FAB)가 같이 잡히므로
 * 보이지 않는 별도 캡처 전용 컨테이너(ShareCard)를 일시 렌더해 캡처한 뒤 제거한다.
 */
export function PortfolioShareButton({ holdings, summary, userName }: Props) {
    const { t, language } = useLanguage()
    const { baseCurrency } = useCurrency()
    const [capturing, setCapturing] = useState(false)
    const [renderCard, setRenderCard] = useState(false)

    const captureAndShare = useCallback(async () => {
        if (capturing) return
        if (holdings.length === 0) {
            toast.error(t('shareEmptyHoldings'))
            return
        }

        setCapturing(true)
        setRenderCard(true)

        // 다음 프레임에 DOM이 마운트된 후 캡처 시작
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        // webfont/이미지 로드 안정화를 위해 한 프레임 더
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

        const node = document.getElementById('portfolio-share-card')
        if (!node) {
            setCapturing(false)
            setRenderCard(false)
            toast.error(t('shareFailed'))
            return
        }

        try {
            // 다크/라이트 모드 모두 자연스럽게 잡히도록 컴퓨티드된 background 사용
            const bg = getComputedStyle(document.documentElement)
                .getPropertyValue('--background').trim() || '#ffffff'

            const dataUrl = await toPng(node, {
                pixelRatio: 2,
                cacheBust: true,
                backgroundColor: bg.startsWith('#') || bg.startsWith('rgb')
                    ? bg
                    : `hsl(${bg})`,
            })

            const blob = await (await fetch(dataUrl)).blob()
            const fileName = `snapshot-finance-${formatDateForFilename()}.png`
            const file = new File([blob], fileName, { type: 'image/png' })

            // 모바일 OS 공유 시트
            type NavigatorShare = Navigator & {
                share?: (data: { files?: File[]; title?: string; text?: string; url?: string }) => Promise<void>
                canShare?: (data: { files?: File[] }) => boolean
            }
            const navShare = navigator as NavigatorShare
            const canShareFiles = typeof navShare.canShare === 'function'
                && navShare.canShare({ files: [file] })
            if (typeof navShare.share === 'function' && canShareFiles) {
                try {
                    await navShare.share({
                        files: [file],
                        title: language === 'ko' ? '내 포트폴리오' : 'My Portfolio',
                    })
                    toast.success(t('shareSuccess'))
                    return
                } catch (err) {
                    // 사용자 취소(AbortError)는 토스트 스킵
                    if (err instanceof Error && err.name === 'AbortError') return
                    // 그 외는 다운로드 폴백으로 진행
                }
            }

            // 폴백: PNG 다운로드
            const a = document.createElement('a')
            a.href = dataUrl
            a.download = fileName
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            toast.success(t('shareDownloaded'))
        } catch (err) {
            console.error('[portfolio-share] capture failed', err)
            toast.error(t('shareFailed'))
        } finally {
            setCapturing(false)
            setRenderCard(false)
        }
    }, [capturing, holdings.length, language, t])

    return (
        <>
            <button
                type="button"
                onClick={captureAndShare}
                disabled={capturing}
                aria-label={t('share')}
                className="text-[11px] font-bold tracking-wide px-2 py-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
                {capturing
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Share2 className="w-3.5 h-3.5" />}
                {t('share')}
            </button>

            {renderCard && typeof document !== 'undefined' && createPortal(
                <ShareCard
                    holdings={holdings}
                    summary={summary}
                    userName={userName}
                    baseCurrency={baseCurrency}
                    language={language}
                />,
                document.body,
            )}
        </>
    )
}

interface ShareCardProps {
    holdings: ShareHolding[]
    summary: ShareSummary
    userName: string | null | undefined
    baseCurrency: 'KRW' | 'USD'
    language: 'ko' | 'en'
}

/**
 * 캡처 전용 카드 — 화면 밖 좌표(left: -9999px)에 렌더해 사용자 눈에 보이지 않게 한다.
 * 너비는 고정해 어떤 디바이스에서도 동일한 결과를 얻도록 한다.
 */
function ShareCard({ holdings, summary, userName, baseCurrency, language }: ShareCardProps) {
    const exRate = summary.exchangeRate || 1435

    const toBase = (h: ShareHolding, value: number) =>
        baseCurrency === 'KRW'
            ? (h.currency === 'USD' ? value * exRate : value)
            : (h.currency === 'USD' ? value : value / exRate)

    const costBase = (h: ShareHolding) => {
        const effRate = h.currency === 'USD'
            ? (h.purchaseRate && h.purchaseRate !== 1 ? h.purchaseRate : exRate)
            : 1
        return baseCurrency === 'KRW'
            ? (h.currency === 'USD' ? h.totalCost * effRate : h.totalCost)
            : (h.currency === 'USD' ? h.totalCost : h.totalCost / exRate)
    }

    // 평가금액 기준 정렬 (큰 순)
    const sorted = [...holdings].sort((a, b) => toBase(b, b.currentValue) - toBase(a, a.currentValue))

    const totalValueBase = baseCurrency === 'KRW'
        ? summary.totalValue
        : summary.totalValue / exRate
    const totalCostBaseSum = sorted.reduce((acc, h) => acc + costBase(h), 0)
    const totalProfitBase = totalValueBase - totalCostBaseSum
    const totalProfitRate = totalCostBaseSum > 0
        ? new Decimal(totalProfitBase).div(totalCostBaseSum).times(100).toNumber()
        : 0
    const cashBase = baseCurrency === 'KRW'
        ? summary.cashBalance
        : summary.cashBalance / exRate

    const dateLabel = formatToday(language)
    const headerName = userName?.trim() || (language === 'ko' ? '나' : 'Me')
    const headerTitle = language === 'ko'
        ? `${headerName}의 포트폴리오`
        : `${headerName}'s Portfolio`

    return (
        <div
            // 화면 밖에 위치시켜 캡처 시점에만 렌더링되는 컨테이너
            style={{
                position: 'fixed',
                top: 0,
                left: '-99999px',
                zIndex: -1,
                width: `${CARD_WIDTH}px`,
                pointerEvents: 'none',
            }}
            aria-hidden
        >
            <div
                id="portfolio-share-card"
                className="bg-background text-foreground"
                style={{ width: `${CARD_WIDTH}px`, padding: '32px 28px' }}
            >
                {/* 헤더 */}
                <div style={{ marginBottom: '24px' }}>
                    <div className="eyebrow" style={{ marginBottom: '8px' }}>
                        Snapshot Finance
                    </div>
                    <div
                        className="hero-serif text-foreground"
                        style={{ fontSize: '26px', lineHeight: 1.15 }}
                    >
                        {headerTitle}
                    </div>
                    <div
                        className="text-muted-foreground numeric"
                        style={{ fontSize: '12px', marginTop: '6px', letterSpacing: '0.5px' }}
                    >
                        {dateLabel}
                    </div>
                </div>

                {/* 요약 박스 */}
                <div
                    className="bg-card border border-border"
                    style={{ padding: '18px 18px 16px', marginBottom: '20px' }}
                >
                    <div
                        className="text-muted-foreground"
                        style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
                    >
                        {language === 'ko' ? '총 자산' : 'Total Value'}
                    </div>
                    <div
                        className="font-serif numeric text-foreground"
                        style={{ fontSize: '28px', fontWeight: 600, lineHeight: 1.1, marginTop: '4px' }}
                    >
                        {formatCurrency(totalValueBase, baseCurrency)}
                    </div>
                    <div
                        className="numeric"
                        style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            marginTop: '6px',
                            color: totalProfitBase >= 0 ? 'var(--profit, #16a34a)' : 'var(--loss, #dc2626)',
                        }}
                    >
                        {totalProfitBase >= 0 ? '+' : ''}
                        {formatCurrency(totalProfitBase, baseCurrency)}
                        {' · '}
                        {totalProfitBase >= 0 ? '▲' : '▼'} {Math.abs(totalProfitRate).toFixed(2)}%
                    </div>
                    <div
                        style={{
                            marginTop: '12px',
                            paddingTop: '12px',
                            borderTop: '1px solid var(--border)',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '12px',
                        }}
                    >
                        <SummaryCell
                            label={language === 'ko' ? '매입금' : 'Cost'}
                            value={formatCurrency(totalCostBaseSum, baseCurrency)}
                        />
                        <SummaryCell
                            label={language === 'ko' ? '예수금' : 'Cash'}
                            value={formatCurrency(cashBase, baseCurrency)}
                        />
                    </div>
                </div>

                {/* 보유 종목 헤더 */}
                <div
                    className="eyebrow"
                    style={{ marginBottom: '10px' }}
                >
                    {language === 'ko' ? '보유 종목' : 'Holdings'} · {sorted.length}
                </div>

                {/* 종목 목록 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {sorted.map((h, idx) => {
                        const valueBase = toBase(h, h.currentValue)
                        const cost = costBase(h)
                        const profit = valueBase - cost
                        const profitRate = cost > 0 ? (profit / cost) * 100 : 0
                        const weight = totalValueBase > 0 ? (valueBase / totalValueBase) * 100 : 0
                        const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length]

                        return (
                            <div
                                key={h.id}
                                className="bg-card border border-border"
                                style={{
                                    padding: '12px 14px',
                                    borderLeftWidth: '3px',
                                    borderLeftColor: color,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        gap: '10px',
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            className="font-serif text-foreground"
                                            style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.25 }}
                                        >
                                            {h.stockName}
                                        </div>
                                        <div
                                            className="text-muted-foreground numeric"
                                            style={{ fontSize: '10px', letterSpacing: '0.5px', marginTop: '3px' }}
                                        >
                                            {h.stockCode} · {formatNumber(h.quantity)}
                                            {language === 'ko' ? '주' : 'shr'}
                                            {' · '}
                                            {language === 'ko' ? '평단 ' : 'avg '}
                                            {formatCurrency(h.averagePrice, h.currency)}
                                        </div>
                                        <div
                                            className="text-muted-foreground numeric"
                                            style={{ fontSize: '10px', letterSpacing: '0.5px', marginTop: '2px' }}
                                        >
                                            {language === 'ko' ? '비중' : 'Wt'} {weight.toFixed(1)}%
                                            {' · '}
                                            {language === 'ko' ? '매입' : 'Cost'} {formatCurrency(cost, baseCurrency)}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div
                                            className="numeric text-foreground"
                                            style={{ fontSize: '13px', fontWeight: 700 }}
                                        >
                                            {formatCurrency(valueBase, baseCurrency)}
                                        </div>
                                        <div
                                            className="numeric"
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                marginTop: '2px',
                                                color: profit >= 0 ? 'var(--profit, #16a34a)' : 'var(--loss, #dc2626)',
                                            }}
                                        >
                                            {profit >= 0 ? '▲' : '▼'} {Math.abs(profitRate).toFixed(2)}%
                                        </div>
                                        <div
                                            className="numeric"
                                            style={{
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                marginTop: '1px',
                                                color: profit >= 0 ? 'var(--profit, #16a34a)' : 'var(--loss, #dc2626)',
                                            }}
                                        >
                                            {profit >= 0 ? '+' : ''}
                                            {formatCurrency(profit, baseCurrency)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* 워터마크 / 푸터 */}
                <div
                    style={{
                        marginTop: '20px',
                        paddingTop: '14px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div
                        className="eyebrow text-muted-foreground"
                        style={{ fontSize: '9px' }}
                    >
                        Snapshot Finance
                    </div>
                    <div
                        className="text-muted-foreground numeric"
                        style={{ fontSize: '9px', letterSpacing: '0.5px' }}
                    >
                        {baseCurrency === 'KRW'
                            ? `1 USD ≈ ₩${formatNumber(exRate, 0)}`
                            : `${language === 'ko' ? '기준 통화' : 'Base'} USD`}
                    </div>
                </div>
            </div>
        </div>
    )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div
                className="text-muted-foreground"
                style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
            >
                {label}
            </div>
            <div
                className="numeric text-foreground"
                style={{ fontSize: '13px', fontWeight: 600, marginTop: '2px' }}
            >
                {value}
            </div>
        </div>
    )
}

function formatToday(language: 'ko' | 'en'): string {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return language === 'ko'
        ? `${yyyy}.${mm}.${dd}`
        : `${yyyy}-${mm}-${dd}`
}

function formatDateForFilename(): string {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}${mm}${dd}`
}
