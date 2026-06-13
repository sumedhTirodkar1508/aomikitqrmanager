"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SheetFooter } from "@/components/ui/sheet"
import Link from "next/link"
import { importTokens, type ImportState } from "./import-actions"
import { Spinner } from "@/components/ui/spinner"

export default function ImportForm() {
  const [resetKey, setResetKey] = useState(0)
  return (
    <ImportFormInner
      key={resetKey}
      onReset={() => setResetKey((prev) => prev + 1)}
    />
  )
}

function ImportFormInner({ onReset }: { onReset: () => void }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    importTokens,
    {}
  )

  return (
    <form action={formAction} className="flex flex-1 flex-col min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {state.error && (
          <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        {state.result ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-success px-4 py-3 text-sm text-success-foreground">
              <p className="font-semibold">
                Import complete successfully
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                Token duplicate verification and structural validations completed.
              </p>
            </div>

            {/* Success Summary statistics grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="form-section">
                <div className="text-xs font-medium text-muted-foreground">Total Rows</div>
                <div className="mt-1 text-2xl font-bold">{state.result.total}</div>
              </div>
              <div className="rounded-3xl bg-success p-4 text-success-foreground">
                <div className="text-xs font-semibold">Inserted</div>
                <div className="mt-1 text-2xl font-bold">{state.result.inserted}</div>
              </div>
              <div className="form-section">
                <div className="text-xs font-medium text-muted-foreground">Skipped Duplicate</div>
                <div className="mt-1 text-2xl font-bold">{state.result.skippedDuplicate}</div>
              </div>
              <div className="rounded-3xl bg-destructive/10 p-4 text-destructive">
                <div className="text-xs font-semibold">Invalid</div>
                <div className="mt-1 text-2xl font-bold">{state.result.invalid}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="batchName">Batch name</Label>
              <Input
                id="batchName"
                name="batchName"
                placeholder="Optional label for this import"
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="csvText">Paste CSV</Label>
              <Textarea
                id="csvText"
                name="csvText"
                rows={8}
                placeholder={"token\nAOMI-KIT-7F3K9Q\nAOMI-KIT-2M8XQT"}
                disabled={pending}
                className="font-mono text-xs min-h-[120px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">…or upload a .csv file</Label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv,text/plain"
                disabled={pending}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
              />
            </div>
          </div>
        )}
      </div>

      <SheetFooter className="shrink-0 flex-row items-center justify-end gap-3 border-t border-border/70 bg-card px-6 py-4">
        {state.result ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onReset}>
              Import another file
            </Button>
            <Button variant="default" size="sm" asChild>
              <Link href="/admin/qr-tokens">Close</Link>
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" asChild disabled={pending}>
              <Link href="/admin/qr-tokens">Cancel</Link>
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Spinner />}
              {pending ? "Importing…" : "Import tokens"}
            </Button>
          </>
        )}
      </SheetFooter>
    </form>
  )
}
