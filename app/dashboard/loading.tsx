import Image from 'next/image'

export default function DashboardLoading() {
    return (
        <div className="flex flex-1 w-full min-h-[60vh] flex-col items-center justify-center gap-6 bg-background">
            <Image
                src="/logo.png"
                alt="Snapshot Finance"
                width={64}
                height={64}
                priority
            />
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
    )
}
