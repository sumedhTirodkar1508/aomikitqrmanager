"use client"

import React, { useState, useTransition, createContext, useContext } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

const TransitionContext = createContext<{
  isPending: boolean
  startTransition: React.TransitionStartFunction
} | null>(null)

export function useFilterTransition() {
  const ctx = useContext(TransitionContext)
  if (!ctx) {
    return { isPending: false, startTransition: (cb: () => void) => cb() }
  }
  return ctx
}

interface QrTokenFiltersProps {
  batches: { id: string; batchName: string | null }[]
  statuses: string[]
  children: React.ReactNode
}

export function QrTokenFilters({ batches, statuses, children }: QrTokenFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const qParam = searchParams.get("q") ?? ""
  const statusParam = searchParams.get("status") ?? "all"
  const batchParam = searchParams.get("batch") ?? "all"

  const [searchInput, setSearchInput] = useState(qParam)

  const applyFilters = (newQ: string, newStatus: string, newBatch: string) => {
    const params = new URLSearchParams(searchParams.toString())

    const trimmedQ = newQ.trim()
    if (trimmedQ) {
      params.set("q", trimmedQ)
    } else {
      params.delete("q")
    }

    if (newStatus && newStatus !== "all") {
      params.set("status", newStatus)
    } else {
      params.delete("status")
    }

    if (newBatch && newBatch !== "all") {
      params.set("batch", newBatch)
    } else {
      params.delete("batch")
    }

    // Changing filter parameters resets the page to 1
    params.set("page", "1")

    startTransition(() => {
      router.push(`/admin/qr-tokens?${params.toString()}`)
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters(searchInput, statusParam, batchParam)
  }

  const handleClear = () => {
    const params = new URLSearchParams()
    const pageSize = searchParams.get("pageSize")
    if (pageSize) {
      params.set("pageSize", pageSize)
    }
    params.set("page", "1")
    setSearchInput("")
    startTransition(() => {
      router.push(`/admin/qr-tokens?${params.toString()}`)
    })
  }

  const hasActiveFilters = !!(qParam || (statusParam !== "all") || (batchParam !== "all"))

  return (
    <TransitionContext.Provider value={{ isPending, startTransition }}>
      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="filter-bar grid grid-cols-1 sm:grid-cols-2 xl:flex">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search token…"
            disabled={isPending}
            className="w-full min-w-0 xl:min-w-44 xl:flex-1"
          />

          <Select
            value={statusParam}
            disabled={isPending}
            onValueChange={(val) => applyFilters(qParam, val, batchParam)}
          >
            <SelectTrigger className="w-full xl:w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={batchParam}
            disabled={isPending}
            onValueChange={(val) => applyFilters(qParam, statusParam, val)}
          >
            <SelectTrigger className="w-full xl:w-56">
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.batchName ?? b.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isPending}
              className="justify-self-start xl:shrink-0"
            >
              Clear
            </Button>
          )}
        </form>

        {/* Logical results region wrapper */}
        <div
          className="relative transition-opacity duration-200"
          style={{ opacity: isPending ? 0.6 : 1 }}
          aria-busy={isPending}
        >
          {isPending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/5 backdrop-blur-[0.5px]">
              <div
                className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 shadow-md animate-in fade-in zoom-in-95 duration-150"
                aria-live="polite"
                role="status"
              >
                <Spinner className="h-4 w-4" />
                <span className="text-sm font-medium text-muted-foreground">Updating results…</span>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </TransitionContext.Provider>
  )
}
