export default function SnapshotDetailLoading() {
    return (
        <div className="flex flex-1 w-full flex-col items-center justify-center gap-4">
            <div className="w-64 max-w-full space-y-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-primary animate-indeterminate rounded-full" />
                </div>
            </div>
        </div>
    )
}
