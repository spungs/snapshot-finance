import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LucideIcon } from "lucide-react"

interface StepCardProps {
    step: number
    title: string
    description: string
    icon: LucideIcon
}

export function StepCard({ step, title, description, icon: Icon }: StepCardProps) {
    return (
        <Card className="relative overflow-hidden border-none shadow-lg bg-card/50 backdrop-blur-sm transition-all hover:scale-[1.02]">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <span className="text-8xl font-black">{step}</span>
            </div>
            <CardHeader className="relative z-10 space-y-4 pb-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">
                    <span className="mr-2 text-muted-foreground font-light">Step {step}.</span>
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 text-muted-foreground leading-relaxed">
                {description}
            </CardContent>
        </Card>
    )
}
