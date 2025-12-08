'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { formatDate } from '@/lib/utils/formatters'

interface ChartDataPoint {
  date: string
  profitRate: number
  totalValue: number
}

interface ProfitChartProps {
  data: ChartDataPoint[]
}

export function ProfitChart({ data }: ProfitChartProps) {
  const formattedData = data.map((d) => ({
    ...d,
    date: formatDate(d.date, 'MM/dd'),
    profitRate: Number(d.profitRate.toFixed(2)),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>수익률 추이</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            스냅샷 데이터가 없습니다.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis
                tickFormatter={(value) => `${value}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, '수익률']}
                labelFormatter={(label) => `날짜: ${label}`}
              />
              <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="profitRate"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: '#2563eb', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
