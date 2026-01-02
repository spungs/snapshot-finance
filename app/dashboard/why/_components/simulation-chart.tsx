'use client'

import React, { useState } from 'react'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

// S&P 500 Data
const sp500Data = {
    100: [
        { yearKey: '0', principal: 0, value: 0 },
        { yearKey: '5', principal: 6000, value: 8200 },
        { yearKey: '10', principal: 12000, value: 23000 },
        { yearKey: '15', principal: 18000, value: 50000 },
        { yearKey: '20', principal: 24000, value: 85000 },
        { yearKey: '30', principal: 36000, value: 220000 },
    ],
    50: [
        { yearKey: '0', principal: 0, value: 0 },
        { yearKey: '5', principal: 3000, value: 4100 },
        { yearKey: '10', principal: 6000, value: 11500 },
        { yearKey: '15', principal: 9000, value: 25000 },
        { yearKey: '20', principal: 12000, value: 42500 },
        { yearKey: '30', principal: 18000, value: 110000 },
    ],
    25: [
        { yearKey: '0', principal: 0, value: 0 },
        { yearKey: '5', principal: 1500, value: 2050 },
        { yearKey: '10', principal: 3000, value: 5750 },
        { yearKey: '15', principal: 4500, value: 12500 },
        { yearKey: '20', principal: 6000, value: 21250 },
        { yearKey: '30', principal: 9000, value: 55000 },
    ],
}

// Nasdaq Data
const nasdaqData = {
    100: [
        { yearKey: '0', principal: 0, value: 0 },
        { yearKey: '5', principal: 6000, value: 9000 },
        { yearKey: '10', principal: 12000, value: 33000 },
        { yearKey: '15', principal: 18000, value: 80000 },
        { yearKey: '20', principal: 24000, value: 120000 },
        { yearKey: '30', principal: 36000, value: 450000 },
    ],
    50: [
        { yearKey: '0', principal: 0, value: 0 },
        { yearKey: '5', principal: 3000, value: 4500 },
        { yearKey: '10', principal: 6000, value: 16500 },
        { yearKey: '15', principal: 9000, value: 40000 },
        { yearKey: '20', principal: 12000, value: 60000 },
        { yearKey: '30', principal: 18000, value: 225000 },
    ],
    25: [
        { yearKey: '0', principal: 0, value: 0 },
        { yearKey: '5', principal: 1500, value: 2250 },
        { yearKey: '10', principal: 3000, value: 8250 },
        { yearKey: '15', principal: 4500, value: 20000 },
        { yearKey: '20', principal: 6000, value: 30000 },
        { yearKey: '30', principal: 9000, value: 112500 },
    ],
}

export function SimulationChart() {
    const { language } = useLanguage()
    const t = translations[language].whyInvestPage.simulation
    const units = translations[language].whyInvestPage.units

    const [market, setMarket] = useState<'sp500' | 'nasdaq'>('sp500')
    const [plan, setPlan] = useState<100 | 50 | 25>(100)

    const rawData = market === 'sp500' ? sp500Data[plan] : nasdaqData[plan]
    const currentData = rawData.map(d => ({
        ...d,
        year: `${d.yearKey}${units.year}`
    }))

    const color = market === 'sp500' ? '#22c55e' : '#8b5cf6'

    // Summary message logic
    const lastData = currentData[currentData.length - 1]
    const multiple = (lastData.value / lastData.principal).toFixed(1)

    return (
        <Card className="w-full">
            <CardHeader className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <CardTitle>{t.chartTitle}</CardTitle>
                    <Tabs defaultValue="sp500" onValueChange={(v) => setMarket(v as 'sp500' | 'nasdaq')}>
                        <TabsList>
                            <TabsTrigger value="sp500">S&P 500</TabsTrigger>
                            <TabsTrigger value="nasdaq">Nasdaq 100</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
                <div className="flex gap-2">
                    {[100, 50, 25].map((amount) => (
                        <Button
                            key={amount}
                            variant={plan === amount ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPlan(amount as 100 | 50 | 25)}
                            className="flex-1"
                        >
                            {t.perMonth.replace('{amount}', amount.toString())}
                        </Button>
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={currentData}
                            margin={{
                                top: 5,
                                right: 30,
                                left: 20,
                                bottom: 5,
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                            <XAxis dataKey="year" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
                            <YAxis
                                fontSize={12}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(value) => `${(value / 10000).toFixed(0)}${units.billion}`}
                            />
                            <Tooltip
                                formatter={(value: number) => [`${(value / 10000).toFixed(1)}${units.hundredMillion}`, '']}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend verticalAlign="top" height={36} />
                            <Line
                                name={t.principal}
                                type="monotone"
                                dataKey="principal"
                                stroke="#64748b"
                                strokeWidth={3}
                                dot={{ r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                            <Line
                                name={market === 'sp500' ? 'S&P 500' : 'Nasdaq 100'}
                                type="monotone"
                                dataKey="value"
                                stroke={color}
                                strokeWidth={3}
                                dot={{ r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-4 rounded-lg bg-muted p-4 text-center">
                    <p className="text-sm font-medium">{t.result.replace('{year}', '30')}</p>
                    <p className="mt-1 text-lg">
                        {t.resultDesc
                            .replace('{principal}', (lastData.principal / 10000).toFixed(1))
                            .replace('{value}', (lastData.value / 10000).toFixed(1))
                            .replace('{multiple}', multiple)
                        }
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
