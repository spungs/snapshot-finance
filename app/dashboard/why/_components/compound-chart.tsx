'use client'

import React from 'react'
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
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

const data = [
    { yearKey: '0', principal: 0, compound: 0 },
    { yearKey: '5', principal: 6000, compound: 8170 },
    { yearKey: '10', principal: 12000, compound: 21380 },
    { yearKey: '15', principal: 18000, compound: 45870 },
    { yearKey: '20', principal: 24000, compound: 87170 },
]

export function CompoundChart() {
    const { language } = useLanguage()
    const t = translations[language].whyInvestPage.compound
    const units = translations[language].whyInvestPage.units

    const chartData = data.map(d => ({
        ...d,
        year: `${d.yearKey}${units.year}`
    }))

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {t.title}
                    <Badge variant="secondary" className="text-xs font-normal">
                        {t.badge}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={chartData}
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
                                name={t.chartLegendPrincipal}
                                type="monotone"
                                dataKey="principal"
                                stroke="#64748b"
                                strokeWidth={3}
                                dot={{ r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                            <Line
                                name={t.chartLegendCompound}
                                type="monotone"
                                dataKey="compound"
                                stroke="#f97316"
                                strokeWidth={3}
                                dot={{ r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-center text-sm">
                    <div className="rounded-lg bg-muted p-3">
                        <p className="text-muted-foreground mb-1">{t.principalOnly}</p>
                        <p className="font-bold text-lg">2.4{units.billion}</p>
                    </div>
                    <div className="rounded-lg bg-orange-100 dark:bg-orange-900/20 p-3">
                        <p className="text-orange-600 dark:text-orange-400 mb-1">{t.invested}</p>
                        <p className="font-bold text-lg text-orange-600 dark:text-orange-400">8.7{units.billion}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
