"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFilterTransition } from "./qr-token-filters"

export function PageSizeSelector({ currentSize }: { currentSize: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isPending, startTransition } = useFilterTransition()

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("pageSize", value)
    params.set("page", "1") // reset to page 1
    startTransition(() => {
      router.push(`/admin/qr-tokens?${params.toString()}`)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Rows per page:</span>
      <Select value={String(currentSize)} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="h-8 w-20 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[50, 100, 500, 1000].map((size) => (
            <SelectItem key={size} value={String(size)} className="text-xs">
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
