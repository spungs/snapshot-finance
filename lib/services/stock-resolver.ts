import { prisma } from '@/lib/prisma'
import { searchLseUsdStocks } from '@/lib/api/twelve-data'

type ResolvedStock = {
    stockCode: string
    nameKo: string
    nameEn: string | null
    market: string
}

/**
 * 종목 식별자(ticker/이름)를 stocks 마스터에서 찾고, 없으면 LSE(Twelve Data)에서 찾아 upsert.
 *
 * 우선순위:
 *  1) stocks 마스터 정확 매칭(stockCode/nameEn) — KIS(한/미) 종목
 *  2) stocks 마스터 한글명 매칭
 *  3) Twelve Data LSE/USD 검색 → stocks 에 market='LSE' 로 upsert → 반환
 *
 * @returns 매칭/생성된 Stock, 못 찾으면 null
 */
export async function resolveOrCreateStock(identifier: string): Promise<ResolvedStock | null> {
    const clean = identifier.trim()
    if (!clean) return null

    // 1) stockCode / nameEn 정확 매칭
    let stock = await prisma.stock.findFirst({
        where: {
            OR: [
                { stockCode: clean },
                { nameEn: { equals: clean, mode: 'insensitive' } },
            ],
        },
        select: { stockCode: true, nameKo: true, nameEn: true, market: true },
    })
    if (stock) return stock

    // 2) 한글명 매칭
    stock = await prisma.stock.findFirst({
        where: {
            OR: [
                { nameKo: clean },
                { nameKo: { contains: clean } },
            ],
        },
        select: { stockCode: true, nameKo: true, nameEn: true, market: true },
    })
    if (stock) return stock

    // 3) LSE(Twelve Data) 검색 — ticker 형태(영문/숫자/점)만 시도해 noise 차단
    if (!/^[A-Za-z0-9.]{1,12}$/.test(clean)) return null
    const matches = await searchLseUsdStocks(clean)
    // symbol 정확 일치 우선
    const hit = matches.find((m) => m.symbol.toUpperCase() === clean.toUpperCase()) ?? matches[0]
    if (!hit) return null

    // stocks 에 동적 등록 (LSE / USD). updatedAt 자동.
    const created = await prisma.stock.upsert({
        where: { stockCode: hit.symbol },
        update: { nameKo: hit.name, nameEn: hit.name, market: 'LSE' },
        create: { stockCode: hit.symbol, nameKo: hit.name, nameEn: hit.name, market: 'LSE' },
        select: { stockCode: true, nameKo: true, nameEn: true, market: true },
    })
    return created
}
