'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatNumber, formatProfitRate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

interface Holding {
  id: string
  stock: {
    stockCode: string
    stockName: string
  }
  quantity: number
  averagePrice: number
  currentPrice: number
  totalCost: number
  currentValue: number
  profit: number
  profitRate: number
}

interface HoldingsTableProps {
  holdings: Holding[]
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>보유 종목</CardTitle>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            보유 종목이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목명</TableHead>
                  <TableHead className="text-right">수량</TableHead>
                  <TableHead className="text-right">평균단가</TableHead>
                  <TableHead className="text-right">현재가</TableHead>
                  <TableHead className="text-right">평가금액</TableHead>
                  <TableHead className="text-right">손익</TableHead>
                  <TableHead className="text-right">수익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) => {
                  const isProfit = Number(holding.profit) >= 0
                  return (
                    <TableRow key={holding.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{holding.stock.stockName}</p>
                          <p className="text-sm text-gray-500">
                            {holding.stock.stockCode}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(holding.quantity)}주
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(holding.averagePrice))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(holding.currentPrice))}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(holding.currentValue))}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium',
                          isProfit ? 'text-red-600' : 'text-blue-600'
                        )}
                      >
                        {isProfit ? '+' : ''}
                        {formatCurrency(Number(holding.profit))}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-bold',
                          isProfit ? 'text-red-600' : 'text-blue-600'
                        )}
                      >
                        {formatProfitRate(Number(holding.profitRate))}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
