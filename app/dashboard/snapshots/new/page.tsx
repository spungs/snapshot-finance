'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { snapshotsApi, stocksApi } from '@/lib/api/client'
import { formatCurrency } from '@/lib/utils/formatters'

const TEST_ACCOUNT_ID = 'test-account-1'

interface Stock {
  id: string
  stockCode: string
  stockName: string
}

interface HoldingInput {
  stockId: string
  quantity: string
  averagePrice: string
  currentPrice: string
}

export default function NewSnapshotPage() {
  const router = useRouter()
  const [stocks, setStocks] = useState<Stock[]>([])
  const [holdings, setHoldings] = useState<HoldingInput[]>([
    { stockId: '', quantity: '', averagePrice: '', currentPrice: '' },
  ])
  const [cashBalance, setCashBalance] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [stocksLoading, setStocksLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStocks() {
      try {
        const response = await stocksApi.getList()
        if (response.success && response.data) {
          setStocks(response.data)
        }
      } catch (err) {
        console.error('Failed to fetch stocks:', err)
      } finally {
        setStocksLoading(false)
      }
    }

    fetchStocks()
  }, [])

  function addHolding() {
    setHoldings([
      ...holdings,
      { stockId: '', quantity: '', averagePrice: '', currentPrice: '' },
    ])
  }

  function removeHolding(index: number) {
    if (holdings.length === 1) return
    setHoldings(holdings.filter((_, i) => i !== index))
  }

  function updateHolding(
    index: number,
    field: keyof HoldingInput,
    value: string
  ) {
    const updated = [...holdings]
    updated[index] = { ...updated[index], [field]: value }
    setHoldings(updated)
  }

  function calculateTotals() {
    let totalCost = 0
    let totalValue = 0

    holdings.forEach((h) => {
      const qty = parseFloat(h.quantity) || 0
      const avg = parseFloat(h.averagePrice) || 0
      const curr = parseFloat(h.currentPrice) || 0

      totalCost += qty * avg
      totalValue += qty * curr
    })

    const profit = totalValue - totalCost
    const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0

    return { totalCost, totalValue, profit, profitRate }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // 유효성 검사
    const validHoldings = holdings.filter(
      (h) =>
        h.stockId &&
        parseFloat(h.quantity) > 0 &&
        parseFloat(h.averagePrice) > 0 &&
        parseFloat(h.currentPrice) > 0
    )

    if (validHoldings.length === 0) {
      setError('최소 1개 이상의 유효한 보유 종목을 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      const response = await snapshotsApi.create({
        accountId: TEST_ACCOUNT_ID,
        holdings: validHoldings.map((h) => ({
          stockId: h.stockId,
          quantity: parseInt(h.quantity),
          averagePrice: parseFloat(h.averagePrice),
          currentPrice: parseFloat(h.currentPrice),
        })),
        cashBalance: parseFloat(cashBalance) || 0,
        note: note || undefined,
      })

      if (response.success) {
        router.push('/dashboard')
      } else {
        setError(response.error?.message || '스냅샷 생성에 실패했습니다.')
      }
    } catch (err) {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const totals = calculateTotals()
  const isProfit = totals.profit >= 0

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
        >
          ← 대시보드
        </Link>
        <h1 className="text-2xl font-bold">새 스냅샷 생성</h1>
        <p className="text-gray-500">
          현재 포트폴리오 상태를 기록합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 보유 종목 입력 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>보유 종목</span>
              <Button type="button" variant="outline" onClick={addHolding}>
                + 종목 추가
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {holdings.map((holding, index) => (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 border rounded-lg"
              >
                <div className="md:col-span-5 flex justify-between items-center">
                  <span className="font-medium">종목 {index + 1}</span>
                  {holdings.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => removeHolding(index)}
                    >
                      삭제
                    </Button>
                  )}
                </div>

                <div>
                  <Label htmlFor={`stock-${index}`}>종목</Label>
                  <Select
                    value={holding.stockId}
                    onValueChange={(value) =>
                      updateHolding(index, 'stockId', value)
                    }
                  >
                    <SelectTrigger id={`stock-${index}`}>
                      <SelectValue placeholder="종목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {stocksLoading ? (
                        <SelectItem value="" disabled>
                          로딩중...
                        </SelectItem>
                      ) : (
                        stocks.map((stock) => (
                          <SelectItem key={stock.id} value={stock.id}>
                            {stock.stockName} ({stock.stockCode})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor={`quantity-${index}`}>수량</Label>
                  <Input
                    id={`quantity-${index}`}
                    type="number"
                    min="1"
                    placeholder="100"
                    value={holding.quantity}
                    onChange={(e) =>
                      updateHolding(index, 'quantity', e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label htmlFor={`avgPrice-${index}`}>평균단가</Label>
                  <Input
                    id={`avgPrice-${index}`}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="70000"
                    value={holding.averagePrice}
                    onChange={(e) =>
                      updateHolding(index, 'averagePrice', e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label htmlFor={`currPrice-${index}`}>현재가</Label>
                  <Input
                    id={`currPrice-${index}`}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="75000"
                    value={holding.currentPrice}
                    onChange={(e) =>
                      updateHolding(index, 'currentPrice', e.target.value)
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 추가 정보 */}
        <Card>
          <CardHeader>
            <CardTitle>추가 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cashBalance">예수금</Label>
                <Input
                  id="cashBalance"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={cashBalance}
                  onChange={(e) => setCashBalance(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="note">메모 (선택)</Label>
                <Input
                  id="note"
                  type="text"
                  placeholder="스냅샷에 대한 메모"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 요약 미리보기 */}
        <Card>
          <CardHeader>
            <CardTitle>요약 미리보기</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">총 매입금액</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(totals.totalCost)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">총 평가금액</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(totals.totalValue)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">평가손익</p>
                <p
                  className={`text-lg font-semibold ${
                    isProfit ? 'text-red-600' : 'text-blue-600'
                  }`}
                >
                  {isProfit ? '+' : ''}
                  {formatCurrency(totals.profit)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">수익률</p>
                <p
                  className={`text-lg font-semibold ${
                    isProfit ? 'text-red-600' : 'text-blue-600'
                  }`}
                >
                  {isProfit ? '+' : ''}
                  {totals.profitRate.toFixed(2)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* 제출 버튼 */}
        <div className="flex gap-4">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? '저장중...' : '스냅샷 저장'}
          </Button>
          <Link href="/dashboard" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              취소
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
