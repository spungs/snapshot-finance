import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface FormulaCardProps {
    title: string
    formula: string
    description: string
    variables?: { name: string, desc: string }[]
}

export function FormulaCard({ title, formula, description, variables }: FormulaCardProps) {
    return (
        <Card className="overflow-hidden border-none shadow-lg bg-card/50 backdrop-blur-sm">
            <CardHeader className="bg-muted/50 pb-4">
                <CardTitle className="text-lg font-medium text-center">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="py-4 px-2 bg-background rounded-lg text-center shadow-inner border border-muted">
                    <code className="text-base sm:text-lg md:text-xl font-mono text-primary font-bold break-words whitespace-normal tracking-tight leading-relaxed block w-full">
                        {formula}
                    </code>
                </div>
                <p className="text-sm md:text-base text-muted-foreground text-center text-balance break-keep leading-relaxed">
                    {description}
                </p>
                {variables && (
                    <div className="pt-4 border-t text-sm space-y-3">
                        {variables.map((v, i) => (
                            <div key={i} className="flex flex-col sm:flex-row justify-between sm:items-center gap-1 sm:gap-2 text-muted-foreground bg-muted/20 p-2 rounded">
                                <span className="font-mono bg-muted px-2 py-1 rounded text-xs font-semibold w-fit shrink-0">{v.name}</span>
                                <span className="text-xs sm:text-right text-balance break-keep">{v.desc}</span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
