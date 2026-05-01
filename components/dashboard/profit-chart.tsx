'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart,
  Area,
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

const PROFIT_COLOR = '#f43f5e'
const LOSS_COLOR = '#3b82f6'

export function ProfitChart({ data }: ProfitChartProps) {
  const formattedData = data.map((d) => ({
    ...d,
    date: formatDate(d.date, 'MM.dd'),
    profitRate: Number(d.profitRate.toFixed(2)),
  }))

  const lastRate = formattedData[formattedData.length - 1]?.profitRate ?? 0
  const isUp = lastRate >= 0
  const lineColor = isUp ? PROFIT_COLOR : LOSS_COLOR

  return (
    <Card>
      <CardHeader>
        <CardTitle>수익률 추이</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            스냅샷 데이터가 없습니다.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={formattedData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(value) => `${value}%`}
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, '수익률']}
                labelFormatter={(label) => `날짜: ${label}`}
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
                  borderRadius: '12px',
                  color: 'var(--card-foreground)',
                  fontSize: '12px',
                  boxShadow: '0 8px 32px hsl(224 71% 4% / 0.4)',
                }}
                cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Area
                type="monotoneX"
                dataKey="profitRate"
                stroke={lineColor}
                strokeWidth={2}
                fill="url(#profitGradient)"
                dot={false}
                activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
