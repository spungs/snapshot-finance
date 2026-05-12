'use client'

import { useMemo, useState } from 'react'
import Decimal from 'decimal.js'
import { Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { ParsedAction } from '@/app/api/ai/portfolio/route'

export interface HoldingContext {
    id: string
    stockId: string
    stockName: string
    quantity: number
    averagePrice: number
    currency: string
    accountId: string | null
    accountName: string | null
}

export interface AccountSummary {
    id: string
    name: string
}

export type ConfirmData =
    | {
          type: 'add_holding'
          accountId: string
          stockName: string
          quantity: number
          averagePrice: number
          currency: 'KRW' | 'USD'
          stockMarket?: string
      }
    | {
          type: 'update_holding'
          holdingId: string
          quantity?: number
          averagePrice?: number
      }
    | { type: 'delete_holding'; holdingId: string }

interface AiActionCardProps {
    action: ParsedAction
    holdings: HoldingContext[]
    accounts: AccountSummary[]
    executing: boolean
    onConfirm: (data: ConfirmData) => void
    onCancel: () => void
}

// 보유 종목 매칭: 종목명 부분 일치 + accountId 있으면 필터
function findHoldingMatches(
    holdings: HoldingContext[],
    query: string,
    accountId?: string,
): HoldingContext[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const filtered = accountId
        ? holdings.filter(h => h.accountId === accountId)
        : holdings
    const exact = filtered.filter(h => h.stockName.toLowerCase() === q)
    if (exact.length > 0) return exact
    return filtered.filter(h => {
        const name = h.stockName.toLowerCase()
        return name.includes(q) || q.includes(name)
    })
}

// 금액 표시: decimal.js 로 toFixed 후 천 단위 콤마.
function formatNumber(n: number | string, fractionDigits = 0): string {
    try {
        const d = new Decimal(n)
        const parts = d.toFixed(fractionDigits).split('.')
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        return parts.join('.')
    } catch {
        return String(n)
    }
}

// 사용자가 비운 입력을 number 로 안전 변환. 빈 문자열 / 음수 / NaN → undefined.
function parsePositiveNumber(v: string): number | undefined {
    const trimmed = v.trim()
    if (!trimmed) return undefined
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n <= 0) return undefined
    return n
}

export function AiActionCard({
    action,
    holdings,
    accounts,
    executing,
    onConfirm,
    onCancel,
}: AiActionCardProps) {
    if (action.type === 'add_holding') {
        return (
            <AddHoldingCard
                action={action}
                accounts={accounts}
                executing={executing}
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        )
    }

    if (action.type === 'update_holding') {
        if (action.intent === 'sell') {
            return (
                <SellHoldingCard
                    action={action}
                    holdings={holdings}
                    executing={executing}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                />
            )
        }
        return (
            <UpdateHoldingCard
                action={action}
                holdings={holdings}
                executing={executing}
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        )
    }

    if (action.type === 'delete_holding') {
        return (
            <DeleteHoldingCard
                action={action}
                holdings={holdings}
                executing={executing}
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        )
    }

    return <></>
}

// ───────────────────────── Card 1: 매수 ─────────────────────────

function AddHoldingCard({
    action,
    accounts,
    executing,
    onConfirm,
    onCancel,
}: {
    action: ParsedAction
    accounts: AccountSummary[]
    executing: boolean
    onConfirm: (data: ConfirmData) => void
    onCancel: () => void
}) {
    // 계좌 1개면 자동 채우고 드롭다운 숨김 — 사용자가 선택할 필요 없음.
    const singleAccount = accounts.length === 1
    const [accountId, setAccountId] = useState<string>(
        action.accountId ?? (singleAccount ? accounts[0].id : ''),
    )
    const [quantity, setQuantity] = useState<string>(
        action.quantity != null ? String(action.quantity) : '',
    )
    const [averagePrice, setAveragePrice] = useState<string>(
        action.averagePrice != null ? String(action.averagePrice) : '',
    )

    const q = parsePositiveNumber(quantity)
    const ap = parsePositiveNumber(averagePrice)
    const currency = action.currency ?? 'KRW'
    const canSubmit = Boolean(accountId) && q != null && ap != null

    const officialName = action.stockOfficialName ?? action.stockName ?? ''

    return (
        <CardShell title="종목 추가">
            {accounts.length >= 2 && (
                <Field label="계좌">
                    <Select value={accountId} onValueChange={setAccountId}>
                        <SelectTrigger className="h-8 w-full text-xs">
                            <SelectValue placeholder="계좌 선택" />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts.map(a => (
                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                    {a.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            <Field label="종목">
                <div className="h-8 flex items-center px-2 text-xs rounded-md bg-muted/40">
                    {officialName}
                </div>
            </Field>

            <Field label="수량">
                <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="수량"
                />
            </Field>

            <Field label="평단가">
                <div className="flex items-center gap-1.5">
                    <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={averagePrice}
                        onChange={e => setAveragePrice(e.target.value)}
                        className="h-8 text-xs"
                        placeholder="평단가"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">
                        {currency}
                    </span>
                </div>
            </Field>

            {currency === 'USD' && action.exchangeRate != null && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                    환율: {formatNumber(action.exchangeRate, 0)} KRW/$
                    {action.estimatedTotalKrw != null && (
                        <> · 매입금액 약 ₩{formatNumber(action.estimatedTotalKrw, 0)}</>
                    )}
                </p>
            )}

            <p className="text-[11px] text-muted-foreground leading-snug">
                💡 이미 보유 중이면 가중평균 평단가로 합산됩니다 (물타기 모드)
            </p>

            <Actions
                executing={executing}
                disabled={!canSubmit}
                confirmLabel="추가"
                onConfirm={() =>
                    onConfirm({
                        type: 'add_holding',
                        accountId,
                        stockName: action.stockName ?? '',
                        quantity: q!,
                        averagePrice: ap!,
                        currency,
                        stockMarket: action.stockMarket,
                    })
                }
                onCancel={onCancel}
            />
        </CardShell>
    )
}

// ───────────────────────── Card 2 (수정) ─────────────────────────

function UpdateHoldingCard({
    action,
    holdings,
    executing,
    onConfirm,
    onCancel,
}: {
    action: ParsedAction
    holdings: HoldingContext[]
    executing: boolean
    onConfirm: (data: ConfirmData) => void
    onCancel: () => void
}) {
    const matches = useMemo(
        () => findHoldingMatches(holdings, action.stockName ?? '', action.accountId),
        [holdings, action.stockName, action.accountId],
    )

    const [holdingId, setHoldingId] = useState<string>(
        matches.length === 1 ? matches[0].id : '',
    )
    const [quantity, setQuantity] = useState<string>(
        action.quantity != null ? String(action.quantity) : '',
    )
    const [averagePrice, setAveragePrice] = useState<string>(
        action.averagePrice != null ? String(action.averagePrice) : '',
    )

    if (matches.length === 0) {
        return (
            <CardShell title="종목 수정">
                <p className="text-xs text-muted-foreground">
                    보유 종목을 찾을 수 없습니다.
                </p>
                <Actions
                    executing={executing}
                    disabled
                    confirmLabel="수정"
                    onConfirm={() => {}}
                    onCancel={onCancel}
                    hideConfirm
                />
            </CardShell>
        )
    }

    const q = parsePositiveNumber(quantity)
    const ap = parsePositiveNumber(averagePrice)
    const canSubmit = Boolean(holdingId) && (q != null || ap != null)

    return (
        <CardShell title="종목 수정">
            <Field label="대상">
                <HoldingSelect
                    value={holdingId}
                    onValueChange={setHoldingId}
                    holdings={matches}
                />
            </Field>

            <Field label="수량">
                <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="변경 안 함"
                />
            </Field>

            <Field label="평단가">
                <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={averagePrice}
                    onChange={e => setAveragePrice(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="변경 안 함"
                />
            </Field>

            <Actions
                executing={executing}
                disabled={!canSubmit}
                confirmLabel="수정"
                onConfirm={() =>
                    onConfirm({
                        type: 'update_holding',
                        holdingId,
                        quantity: q,
                        averagePrice: ap,
                    })
                }
                onCancel={onCancel}
            />
        </CardShell>
    )
}

// ───────────────────────── Card 2 (부분 매도) ─────────────────────────

function SellHoldingCard({
    action,
    holdings,
    executing,
    onConfirm,
    onCancel,
}: {
    action: ParsedAction
    holdings: HoldingContext[]
    executing: boolean
    onConfirm: (data: ConfirmData) => void
    onCancel: () => void
}) {
    const matches = useMemo(
        () => findHoldingMatches(holdings, action.stockName ?? '', action.accountId),
        [holdings, action.stockName, action.accountId],
    )

    const [holdingId, setHoldingId] = useState<string>(
        matches.length === 1 ? matches[0].id : '',
    )

    // AI 가 action.quantity 를 "차감 후 남는 수량"으로 보내므로, 매도 수량 = holding.quantity - action.quantity.
    // 단일 매칭일 때만 초기값을 채울 수 있다 (보유 수량을 알아야 차감 가능).
    const initialSellQty = useMemo(() => {
        if (action.quantity == null) return ''
        if (matches.length !== 1) return ''
        const remaining = new Decimal(action.quantity)
        const sellQty = new Decimal(matches[0].quantity).minus(remaining)
        if (sellQty.lte(0)) return ''
        return sellQty.toString()
    }, [action.quantity, matches])

    const [sellQuantity, setSellQuantity] = useState<string>(initialSellQty)

    const holding = useMemo(
        () => matches.find(h => h.id === holdingId),
        [matches, holdingId],
    )

    if (matches.length === 0) {
        return (
            <CardShell title="수량 줄이기">
                <p className="text-xs text-muted-foreground">
                    보유 종목을 찾을 수 없습니다.
                </p>
                <Actions
                    executing={executing}
                    disabled
                    confirmLabel="수정"
                    onConfirm={() => {}}
                    onCancel={onCancel}
                    hideConfirm
                />
            </CardShell>
        )
    }

    const sellQty = parsePositiveNumber(sellQuantity)
    const holdingQty = holding?.quantity ?? 0
    const exceeds = sellQty != null && holding != null && sellQty > holdingQty
    const remainingAfter =
        sellQty != null && holding != null
            ? new Decimal(holdingQty).minus(sellQty)
            : null
    const canSubmit =
        Boolean(holdingId) && sellQty != null && sellQty > 0 && !exceeds

    return (
        <CardShell title="수량 줄이기">
            <Field label="대상">
                <HoldingSelect
                    value={holdingId}
                    onValueChange={setHoldingId}
                    holdings={matches}
                />
            </Field>

            <Field label="줄일 수량">
                <div className="flex items-center gap-1.5">
                    <Input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        value={sellQuantity}
                        onChange={e => setSellQuantity(e.target.value)}
                        className="h-8 text-xs"
                        placeholder="줄일 수량"
                    />
                    {holding && (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                            (보유 {formatNumber(holding.quantity, 0)}주)
                        </span>
                    )}
                </div>
            </Field>

            {remainingAfter != null && !exceeds && (
                <p className="text-[11px] text-muted-foreground">
                    수정 후 {formatNumber(remainingAfter.toString(), 0)}주
                </p>
            )}

            <Field label="평단가">
                <span className="text-xs text-muted-foreground">변경 안 함</span>
            </Field>

            {exceeds && (
                <p className="text-[11px] text-destructive">
                    보유 수량보다 많이 줄일 수 없습니다.
                </p>
            )}

            <Actions
                executing={executing}
                disabled={!canSubmit}
                confirmLabel="수정"
                onConfirm={() => {
                    if (!holding || sellQty == null) return
                    // PATCH 본문에 평단가 미포함 → 평단가 유지. quantity 는 차감 후 값.
                    const newQty = new Decimal(holding.quantity).minus(sellQty).toNumber()
                    onConfirm({
                        type: 'update_holding',
                        holdingId: holding.id,
                        quantity: newQty,
                    })
                }}
                onCancel={onCancel}
            />
        </CardShell>
    )
}

// ───────────────────────── Card 3: 삭제 ─────────────────────────

function DeleteHoldingCard({
    action,
    holdings,
    executing,
    onConfirm,
    onCancel,
}: {
    action: ParsedAction
    holdings: HoldingContext[]
    executing: boolean
    onConfirm: (data: ConfirmData) => void
    onCancel: () => void
}) {
    const matches = useMemo(
        () => findHoldingMatches(holdings, action.stockName ?? '', action.accountId),
        [holdings, action.stockName, action.accountId],
    )

    const [holdingId, setHoldingId] = useState<string>(
        matches.length === 1 ? matches[0].id : '',
    )

    if (matches.length === 0) {
        return (
            <CardShell title="종목 삭제">
                <p className="text-xs text-muted-foreground">
                    보유 종목을 찾을 수 없습니다.
                </p>
                <Actions
                    executing={executing}
                    disabled
                    confirmLabel="삭제"
                    onConfirm={() => {}}
                    onCancel={onCancel}
                    hideConfirm
                />
            </CardShell>
        )
    }

    const canSubmit = Boolean(holdingId)

    return (
        <CardShell title="종목 삭제">
            <Field label="대상">
                <HoldingSelect
                    value={holdingId}
                    onValueChange={setHoldingId}
                    holdings={matches}
                />
            </Field>

            <p className="text-[11px] text-destructive">
                ⚠️ 삭제 후 복구할 수 없습니다.
            </p>

            <Actions
                executing={executing}
                disabled={!canSubmit}
                confirmLabel="삭제"
                confirmVariant="destructive"
                onConfirm={() =>
                    onConfirm({ type: 'delete_holding', holdingId })
                }
                onCancel={onCancel}
            />
        </CardShell>
    )
}

// ───────────────────────── 공통 빌딩 블록 ─────────────────────────

function CardShell({
    title,
    children,
}: {
    title: string
    children: React.ReactNode
}) {
    return (
        <div className="mt-2 rounded-lg border bg-background/50 p-2.5 flex flex-col gap-1.5">
            <p className="text-xs font-semibold">{title}</p>
            {children}
        </div>
    )
}

function Field({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div className="flex flex-col gap-0.5">
            <Label className="text-[11px] text-muted-foreground">{label}</Label>
            {children}
        </div>
    )
}

function HoldingSelect({
    value,
    onValueChange,
    holdings,
}: {
    value: string
    onValueChange: (v: string) => void
    holdings: HoldingContext[]
}) {
    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="대상 선택" />
            </SelectTrigger>
            <SelectContent>
                {holdings.map(h => (
                    <SelectItem key={h.id} value={h.id} className="text-xs">
                        {h.stockName}
                        {h.accountName && ` (${h.accountName}, ${formatNumber(h.quantity, 0)}주)`}
                        {!h.accountName && ` (${formatNumber(h.quantity, 0)}주)`}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

function Actions({
    executing,
    disabled,
    confirmLabel,
    confirmVariant = 'default',
    onConfirm,
    onCancel,
    hideConfirm = false,
}: {
    executing: boolean
    disabled: boolean
    confirmLabel: string
    confirmVariant?: 'default' | 'destructive'
    onConfirm: () => void
    onCancel: () => void
    hideConfirm?: boolean
}) {
    return (
        <div className="flex gap-2 pt-1">
            {!hideConfirm && (
                <Button
                    size="sm"
                    variant={confirmVariant}
                    className="h-7 text-xs flex-1"
                    onClick={onConfirm}
                    disabled={disabled || executing}
                >
                    {executing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        <>
                            <Check className="w-3 h-3 mr-1" />
                            {confirmLabel}
                        </>
                    )}
                </Button>
            )}
            <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-1"
                onClick={onCancel}
                disabled={executing}
            >
                <X className="w-3 h-3 mr-1" />
                취소
            </Button>
        </div>
    )
}
