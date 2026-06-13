"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SheetFooter } from "@/components/ui/sheet"
import Link from "next/link"
import { generateBatch, type GenerateState } from "./generate-actions"
import { Spinner } from "@/components/ui/spinner"

export default function GenerateForm() {
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    generateBatch,
    {}
  )

  return (
    <form action={formAction} className="flex flex-1 flex-col min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {state.error && (
          <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="quantity">
            Quantity <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={10000}
            defaultValue={10}
            disabled={pending}
            required
          />
          <p className="text-xs text-muted-foreground">Between 1 and 10,000 tokens.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="prefix">Prefix</Label>
          <Input
            id="prefix"
            name="prefix"
            defaultValue="AOMI-KIT"
            placeholder="AOMI-KIT"
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Tokens look like PREFIX-XXXXXX.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="batchName">Batch name</Label>
          <Input
            id="batchName"
            name="batchName"
            placeholder="Optional label, e.g. Spring 2026"
            disabled={pending}
          />
        </div>
      </div>

      <SheetFooter className="shrink-0 flex-row items-center justify-end gap-3 border-t border-border/70 bg-card px-6 py-4">
        <Button variant="outline" size="sm" asChild disabled={pending}>
          <Link href="/admin/qr-tokens">Cancel</Link>
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Generating…" : "Generate batch"}
        </Button>
      </SheetFooter>
    </form>
  )
}
