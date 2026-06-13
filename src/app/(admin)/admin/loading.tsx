import { Skeleton } from "@/components/ui/skeleton"

export default function AdminLoading() {
  return (
    <div className="app-page animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-32 shrink-0 rounded-full" />
      </div>

      {/* Search/Filter Skeleton */}
      <div className="flex gap-2 max-w-sm">
        <Skeleton className="h-9 flex-1 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>

      {/* Table Skeleton */}
      <div className="data-table-shell">
        <div className="border-b border-border px-4 py-3">
          <div className="grid grid-cols-5 gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12 justify-self-end" />
          </div>
        </div>
        <div className="divide-y divide-border/70">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-4 py-4">
              <div className="grid grid-cols-5 gap-4 items-center">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24 font-mono" />
                <Skeleton className="h-5 w-20 rounded-md" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-24 justify-self-end rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
