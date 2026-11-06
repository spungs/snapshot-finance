import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { holdingService } from '@/lib/services/holding-service'
import { accountService } from '@/lib/services/account-service'
import { getUsdExchangeRate } from '@/lib/api/exchange-rate'
import { resolveOrCreateStock } from '@/lib/services/stock-resolver'
import {
    validateAveragePrice,
    validateCashAmount,
    validateCashAccounts,
    sumCashAccounts,
    DEFAULT_CASH_LABEL,
    LIMITS,
} from '@/lib/validation/portfolio-input'
import type { CashAccount } from '@/types/cash'

/**
 * MCP(Claude 커넥터) 전용 포트폴리오 도메인 로직.
 *
 * 세션(쿠키) 없이 서버 간 호출로 들어오므로 모든 함수는 userId 를 명시적으로 받는다.
 * userId 는 라우트에서 토큰 검증 후 MCP_OWNER_EMAIL 로만 결정되며, 클라이언트 입력으로 바뀌지 않는다.
 * 모든 조회·변이는 where 에 userId 를 포함해 소유권을 강제한다 (IDOR 방어).
 */

export class McpToolError extends Error {}

const USD_MARKETS = new Set(['US', 'NAS', 'NYS', 'AMS', 'NASD', 'NYSE', 'AMEX', 'LSE'])
const currencyOf = (market: string | null | undefined): 'KRW' | 'USD' =>
    USD_MARKETS.has(market ?? '') ? 'USD' : 'KRW'

async function afterMutation(userId: string, opts: { accounts?: boolean } = {}) {
    await holdingService.invalidate(userId)
    if (opts.accounts) await accountService.invalidate(userId)
    // 라우트 핸들러 컨텍스트 밖(테스트 스크립트 등)에서는 revalidatePath 가 throw 할 수 있다 — 캐시 무효화는 best-effort.
    try {
        revalidatePath('/dashboard')
        revalidatePath('/dashboard/portfolio')
        if (opts.accounts) revalidatePath('/dashboard/accounts')
    } catch {
        /* noop */
    }
}

/** Serializable 트랜잭션 + 직렬화 충돌(P2034) 재시도 — read-then-write(가중평균) 보호. */
async function runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await prisma.$transaction(fn, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            })
        } catch (error) {
            const isConflict =
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
            if (isConflict && attempt < 2) continue
            throw error
        }
    }
}

function validateIntQuantity(v: number): number {
    if (!Number.isInteger(v) || v <= 0) throw new McpToolError('수량은 1 이상의 정수여야 합니다.')
    if (v > LIMITS.quantity.max) throw new McpToolError(`수량은 ${LIMITS.quantity.max.toLocaleString()}주를 초과할 수 없습니다.`)
    return v
}

function validatePrice(v: number): number {
    const r = validateAveragePrice(v)
    if (!r.ok) throw new McpToolError(r.error)
    return r.value
}

// ───────────────────────── 계좌 ─────────────────────────

type AccountRow = { id: string; name: string }

async function listAccounts(userId: string): Promise<AccountRow[]> {
    return prisma.brokerageAccount.findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    })
}

/** 계좌명(정확 → 부분 일치)으로 계좌를 찾는다. 모호하거나 없으면 후보를 담아 에러. */
function matchAccount(accounts: AccountRow[], name: string): AccountRow {
    const q = name.trim().toLowerCase()
    const exact = accounts.filter(a => a.name.toLowerCase() === q)
    if (exact.length === 1) return exact[0]
    const partial = accounts.filter(a => {
        const n = a.name.toLowerCase()
        return n.includes(q) || q.includes(n)
    })
    if (partial.length === 1) return partial[0]
    const all = accounts.map(a => a.name).join(', ') || '(없음)'
    if (partial.length > 1) {
        throw new McpToolError(`'${name}'과 일치하는 계좌가 여러 개입니다: ${partial.map(a => a.name).join(', ')}`)
    }
    throw new McpToolError(`'${name}' 계좌를 찾을 수 없습니다. 가능한 계좌: ${all}`)
}

// ───────────────────────── 종목 ─────────────────────────

export interface StockCandidate {
    stockCode: string
    nameKo: string
    nameEn: string | null
    market: string
    currency: 'KRW' | 'USD'
}

/** stocks 마스터에서 종목 후보 검색. 코드 정확 일치 → 이름 정확 일치 → 부분 일치 순, 최대 limit 건. */
export async function searchStocks(query: string, limit = 10): Promise<StockCandidate[]> {
    const q = query.trim()
    if (!q) throw new McpToolError('검색어가 비어 있습니다.')
    if (q.length > LIMITS.stockName.maxLength) throw new McpToolError('검색어가 너무 깁니다.')

    const stripped = q.replace(/\s+/g, '')
    const pattern = `%${stripped}%`
    // 한글 공백 변형("더치브로스" ↔ "더치 브로스") 흡수를 위해 REPLACE 후 ILIKE.
    const rows = await prisma.$queryRaw<Omit<StockCandidate, 'currency'>[]>`
        SELECT "stockCode", "nameKo", "nameEn", "market"
        FROM stocks
        WHERE UPPER("stockCode") = UPPER(${q})
           OR REPLACE("nameKo", ' ', '') ILIKE ${pattern}
           OR "nameEn" ILIKE ${`%${q}%`}
        ORDER BY
            CASE
                WHEN UPPER("stockCode") = UPPER(${q}) THEN 0
                WHEN REPLACE("nameKo", ' ', '') ILIKE ${stripped} OR "nameEn" ILIKE ${q} THEN 1
                ELSE 2
            END,
            LENGTH("nameKo") ASC
        LIMIT ${limit}
    `

    if (rows.length > 0) return rows.map(r => ({ ...r, currency: currencyOf(r.market) }))

    // 마스터 미스 → LSE(Twelve Data) 폴백 (ticker 형태만 시도, 히트 시 stocks 에 upsert)
    const lse = await resolveOrCreateStock(q)
    return lse ? [{ ...lse, currency: currencyOf(lse.market) }] : []
}

async function getStockOrThrow(stockCode: string) {
    const stock = await prisma.stock.findUnique({
        where: { stockCode: stockCode.trim() },
        select: { stockCode: true, nameKo: true, nameEn: true, market: true },
    })
    if (!stock) {
        throw new McpToolError(`종목코드 '${stockCode}'를 찾을 수 없습니다. 먼저 search_stock 으로 정확한 stockCode 를 확인하세요.`)
    }
    return stock
}

// ───────────────────────── 조회 ─────────────────────────

export async function getPortfolio(userId: string) {
    const [result, accounts] = await Promise.all([holdingService.getList(userId), listAccounts(userId)])
    if (!result?.success || !('data' in result) || !result.data) {
        throw new McpToolError('포트폴리오 조회에 실패했습니다.')
    }
    const { holdings, summary } = result.data
    return {
        accounts: accounts.map(a => a.name),
        summary: {
            totalValueKRW: summary.totalValue,
            totalStockValueKRW: summary.totalStockValue,
            totalCostKRW: summary.totalCost,
            totalProfitKRW: summary.totalProfit,
            totalProfitRatePct: Number(summary.totalProfitRate.toFixed(2)),
            cashBalanceKRW: summary.cashBalance,
            cashAccounts: summary.cashAccounts,
            usdKrw: summary.exchangeRate,
        },
        holdings: holdings.map(h => ({
            holdingId: h.id,
            account: h.accountName,
            stockCode: h.stockCode,
            name: h.stockName,
            market: h.market,
            currency: h.currency,
            quantity: h.quantity,
            averagePrice: h.averagePrice,
            currentPrice: h.currentPrice,
            purchaseRate: h.currency === 'USD' ? h.purchaseRate : undefined,
            profitRatePct: Number(h.profitRate.toFixed(2)),
        })),
    }
}

// ───────────────────────── 매수 ─────────────────────────

export interface RecordBuyInput {
    stockCode: string
    quantity: number
    price: number
    accountName?: string
    /** USD 종목 매수 시 적용 환율. 미지정 시 현재 환율. */
    exchangeRate?: number
}

/**
 * 매수 기록. 같은 계좌에 이미 보유 중이면 평단가를 가중평균으로 합산한다.
 * USD 종목은 매입 환율(purchaseRate)도 원화 매입원가 기준으로 가중평균해 기존 원가가 왜곡되지 않게 한다.
 */
export async function recordBuy(userId: string, input: RecordBuyInput) {
    const quantity = validateIntQuantity(input.quantity)
    const price = validatePrice(input.price)
    const stock = await getStockOrThrow(input.stockCode)
    const currency = currencyOf(stock.market)

    let rate = 1
    if (currency === 'USD') {
        if (input.exchangeRate !== undefined) {
            if (!(input.exchangeRate > 0 && input.exchangeRate < 100_000)) throw new McpToolError('환율 값이 올바르지 않습니다.')
            rate = input.exchangeRate
        } else {
            rate = await getUsdExchangeRate()
        }
    }

    const accounts = await listAccounts(userId)
    if (accounts.length === 0) throw new McpToolError('등록된 증권 계좌가 없습니다. 앱에서 계좌를 먼저 만들어주세요.')

    let account: AccountRow
    if (input.accountName) {
        account = matchAccount(accounts, input.accountName)
    } else {
        // 계좌 미지정: 이미 그 종목을 가진 계좌가 하나면 거기, 계좌가 하나뿐이면 거기, 아니면 되묻게 한다.
        const holdingAccounts = await prisma.holding.findMany({
            where: { userId, stockCode: stock.stockCode },
            select: { accountId: true },
        })
        const ids = new Set(holdingAccounts.map(h => h.accountId))
        if (ids.size === 1) account = accounts.find(a => ids.has(a.id))!
        else if (accounts.length === 1) account = accounts[0]
        else throw new McpToolError(`어느 계좌에서 매수했는지 accountName 을 지정해주세요. 가능한 계좌: ${accounts.map(a => a.name).join(', ')}`)
    }

    const result = await runSerializable(async tx => {
        const existing = await tx.holding.findFirst({
            where: { userId, accountId: account.id, stockCode: stock.stockCode },
        })

        if (!existing) {
            const created = await tx.holding.create({
                data: {
                    userId,
                    accountId: account.id,
                    stockCode: stock.stockCode,
                    quantity,
                    averagePrice: new Decimal(price).toDecimalPlaces(2).toString(),
                    currentPrice: 0, // 다음 조회 시 holding-service 가 시세를 채운다
                    currency,
                    purchaseRate: new Decimal(rate).toDecimalPlaces(2).toString(),
                },
            })
            return { before: null, after: created }
        }

        const oldQty = new Decimal(existing.quantity)
        const oldAvg = new Decimal(existing.averagePrice.toString())
        const oldRate = new Decimal(existing.purchaseRate.toString())
        const addQty = new Decimal(quantity)
        const newQty = oldQty.plus(addQty)

        const oldCost = oldAvg.times(oldQty)
        const addCost = new Decimal(price).times(addQty)
        const newAvg = oldCost.plus(addCost).div(newQty)

        let newRate = oldRate
        if (currency === 'USD') {
            // legacy(1) 환율은 현재 매수 환율로 간주 — holding-service 의 폴백 규칙과 동일한 의미.
            const effOldRate = oldRate.equals(1) ? new Decimal(rate) : oldRate
            const krwCost = oldCost.times(effOldRate).plus(addCost.times(rate))
            const usdCost = oldCost.plus(addCost)
            newRate = usdCost.isZero() ? new Decimal(rate) : krwCost.div(usdCost)
        }

        const updated = await tx.holding.update({
            where: { id: existing.id },
            data: {
                quantity: newQty.toNumber(),
                averagePrice: newAvg.toDecimalPlaces(2).toString(),
                purchaseRate: newRate.toDecimalPlaces(2).toString(),
                currency,
            },
        })
        return { before: existing, after: updated }
    })

    await afterMutation(userId)
    return {
        account: account.name,
        stock: `${stock.nameKo} (${stock.stockCode})`,
        currency,
        bought: { quantity, price, exchangeRate: currency === 'USD' ? rate : undefined },
        before: result.before
            ? { quantity: result.before.quantity, averagePrice: Number(result.before.averagePrice) }
            : null,
        after: {
            holdingId: result.after.id,
            quantity: result.after.quantity,
            averagePrice: Number(result.after.averagePrice),
            purchaseRate: currency === 'USD' ? Number(result.after.purchaseRate) : undefined,
        },
    }
}

// ───────────────────────── 매도 ─────────────────────────

export interface RecordSellInput {
    stockCode: string
    quantity: number
    accountName?: string
    /** 매도가 — 실현손익 계산용(저장하지 않음). */
    price?: number
}

/** 매도 기록. 평단가는 유지하고 수량만 차감, 0주가 되면 보유 행을 삭제한다. */
export async function recordSell(userId: string, input: RecordSellInput) {
    const quantity = validateIntQuantity(input.quantity)
    const price = input.price !== undefined ? validatePrice(input.price) : undefined
    const stock = await getStockOrThrow(input.stockCode)

    const holdings = await prisma.holding.findMany({
        where: { userId, stockCode: stock.stockCode },
        include: { account: { select: { id: true, name: true } } },
    })
    if (holdings.length === 0) throw new McpToolError(`${stock.nameKo}(${stock.stockCode})을(를) 보유하고 있지 않습니다.`)

    let target = holdings[0]
    if (input.accountName) {
        const account = matchAccount(holdings.map(h => h.account), input.accountName)
        target = holdings.find(h => h.accountId === account.id)!
    } else if (holdings.length > 1) {
        throw new McpToolError(
            `${stock.nameKo}이(가) 여러 계좌에 있습니다. accountName 을 지정해주세요: ` +
            holdings.map(h => `${h.account.name}(${h.quantity}주)`).join(', '),
        )
    }

    const result = await runSerializable(async tx => {
        const current = await tx.holding.findFirst({ where: { id: target.id, userId } })
        if (!current) throw new McpToolError('보유 종목을 찾을 수 없습니다.')
        if (quantity > current.quantity) {
            throw new McpToolError(`보유 수량(${current.quantity}주)보다 많이 매도할 수 없습니다.`)
        }
        const remaining = current.quantity - quantity
        if (remaining === 0) {
            await tx.holding.delete({ where: { id: current.id } })
        } else {
            await tx.holding.update({ where: { id: current.id }, data: { quantity: remaining } })
        }
        return { before: current, remaining }
    })

    await afterMutation(userId)

    const avg = new Decimal(result.before.averagePrice.toString())
    const realized = price !== undefined
        ? new Decimal(price).minus(avg).times(quantity).toDecimalPlaces(2).toNumber()
        : undefined

    return {
        account: target.account.name,
        stock: `${stock.nameKo} (${stock.stockCode})`,
        currency: result.before.currency,
        sold: { quantity, price },
        before: { quantity: result.before.quantity, averagePrice: avg.toNumber() },
        after: result.remaining === 0 ? '전량 매도 — 보유 목록에서 삭제됨' : { quantity: result.remaining, averagePrice: avg.toNumber() },
        realizedProfit: realized,
        note: '예수금은 자동으로 바뀌지 않습니다. 필요하면 set_cash 로 갱신하세요.',
    }
}

// ───────────────────────── 직접 정정 / 삭제 ─────────────────────────

export interface SetHoldingInput {
    holdingId: string
    quantity?: number
    averagePrice?: number
    purchaseRate?: number
}

/** 보유 행을 지정 값으로 직접 덮어쓴다 (증권사 앱과 값 맞추기 등 정정용). */
export async function setHolding(userId: string, input: SetHoldingInput) {
    const data: Prisma.HoldingUpdateInput = {}
    if (input.quantity !== undefined) data.quantity = validateIntQuantity(input.quantity)
    if (input.averagePrice !== undefined) data.averagePrice = validatePrice(input.averagePrice)
    if (input.purchaseRate !== undefined) {
        if (!(input.purchaseRate > 0 && input.purchaseRate < 100_000)) throw new McpToolError('환율 값이 올바르지 않습니다.')
        data.purchaseRate = input.purchaseRate
    }
    if (Object.keys(data).length === 0) throw new McpToolError('바꿀 값(quantity/averagePrice/purchaseRate)을 하나 이상 지정하세요.')

    const before = await prisma.holding.findFirst({
        where: { id: input.holdingId, userId },
        include: { stock: { select: { nameKo: true } }, account: { select: { name: true } } },
    })
    if (!before) throw new McpToolError('보유 종목을 찾을 수 없습니다. get_portfolio 로 holdingId 를 확인하세요.')

    const after = await prisma.holding.update({ where: { id: before.id }, data })
    await afterMutation(userId)
    return {
        account: before.account.name,
        stock: before.stock.nameKo,
        before: { quantity: before.quantity, averagePrice: Number(before.averagePrice), purchaseRate: Number(before.purchaseRate) },
        after: { quantity: after.quantity, averagePrice: Number(after.averagePrice), purchaseRate: Number(after.purchaseRate) },
    }
}

export async function deleteHolding(userId: string, holdingId: string) {
    const before = await prisma.holding.findFirst({
        where: { id: holdingId, userId },
        include: { stock: { select: { nameKo: true } }, account: { select: { name: true } } },
    })
    if (!before) throw new McpToolError('보유 종목을 찾을 수 없습니다. get_portfolio 로 holdingId 를 확인하세요.')
    await prisma.holding.delete({ where: { id: before.id } })
    await afterMutation(userId)
    return {
        deleted: `${before.account.name} · ${before.stock.nameKo}`,
        was: { quantity: before.quantity, averagePrice: Number(before.averagePrice) },
    }
}

// ───────────────────────── 예수금 ─────────────────────────

/**
 * 예수금 라벨 하나의 금액을 설정한다. 없는 라벨이면 새 행으로 추가.
 * 앱의 예수금 다이얼로그(updateCashAccounts)와 같은 규칙: 기본 라벨이 아닌 새 라벨은 같은 이름의 증권 계좌도 만든다.
 */
export async function setCash(userId: string, label: string, amount: number) {
    const amountCheck = validateCashAmount(amount)
    if (!amountCheck.ok) throw new McpToolError(amountCheck.error)

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { cashAccounts: true, cashBalance: true } })
    const current: CashAccount[] = Array.isArray(user?.cashAccounts) ? (user!.cashAccounts as unknown as CashAccount[]) : []

    const key = label.trim().toLowerCase() || DEFAULT_CASH_LABEL.toLowerCase()
    const idx = current.findIndex(a => a.label.trim().toLowerCase() === key)
    const next = current.map(a => ({ ...a }))
    const prevAmount = idx >= 0 ? Number(next[idx].amount) : 0
    if (idx >= 0) next[idx].amount = String(amountCheck.value)
    else next.push({ id: randomUUID(), label: label.trim() || DEFAULT_CASH_LABEL, amount: String(amountCheck.value) })

    const validated = validateCashAccounts(next)
    if (!validated.ok) throw new McpToolError(validated.error)
    const total = sumCashAccounts(validated.value)

    const accounts = await listAccounts(userId)
    const finalLabel = idx >= 0 ? next[idx].label : next[next.length - 1].label
    const needsAccount =
        finalLabel !== DEFAULT_CASH_LABEL && !accounts.some(a => a.name.trim().toLowerCase() === finalLabel.toLowerCase())

    await prisma.$transaction(async tx => {
        if (needsAccount) {
            const maxOrder = await tx.brokerageAccount.aggregate({ where: { userId }, _max: { displayOrder: true } })
            await tx.brokerageAccount.create({
                data: { userId, name: finalLabel, displayOrder: (maxOrder._max.displayOrder ?? -1) + 1 },
            })
        }
        await tx.user.update({
            where: { id: userId },
            data: { cashBalance: total.toString(), cashAccounts: validated.value as unknown as Prisma.InputJsonValue },
        })
    })

    await afterMutation(userId, { accounts: needsAccount })
    return {
        label: finalLabel,
        before: prevAmount,
        after: amountCheck.value,
        totalCash: total.toNumber(),
        createdAccount: needsAccount ? finalLabel : undefined,
    }
}
