"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import type { ComboboxOption } from "@/lib/combobox-filter"
import { QrScannerDialog } from "./qr-scanner-dialog"
import { parseQrPayload, type QrParseFailure } from "@/lib/qr-payload"
import {
  validateToken,
  getRoutinesForDiagnosis,
  getRoutinePreview,
  confirmAssignment,
  type RoutineOption,
  type RoutinePreview,
} from "../actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, ChevronRight, ScanLine } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

type Diagnosis = { id: string; name: string; slug: string }

const STEPS = ["Token", "Diagnosis", "Routine", "Review", "Confirm"]

function messageForParseFailure(reason: QrParseFailure): string {
  switch (reason) {
    case "empty":
      return "Enter or scan a token"
    case "too_long":
      return "That code is too long to be an AOMI token"
    case "invalid_url":
      return "That QR code isn't a valid AOMI code"
    case "external":
      return "That QR code isn't an AOMI Kit code"
    case "no_token":
      return "No token found in that code"
    case "invalid_token":
      return "That doesn't look like a valid token"
  }
}

export default function AssignFlow({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [step, setStep] = useState(0)

  // Step 1
  const [tokenInput, setTokenInput] = useState("")
  const [tokenId, setTokenId] = useState<string | null>(null)
  const [validatedToken, setValidatedToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  // Step 2
  const [diagnosisId, setDiagnosisId] = useState("")

  // Step 3
  const [routines, setRoutines] = useState<RoutineOption[]>([])
  const [routineId, setRoutineId] = useState<string | null>(null)

  // Step 4
  const [preview, setPreview] = useState<RoutinePreview | null>(null)
  const [selections, setSelections] = useState<Record<string, string>>({})

  // Manual typing, USB keyboard-wedge scanners, and the camera scanner all flow
  // through this single path: parse the raw payload (token or AOMI URL) then run
  // the existing server validation.
  function handleValidateToken(explicit?: string) {
    if (pending) return // prevent duplicate simultaneous submissions
    const raw = explicit ?? tokenInput
    setTokenError(null)

    const parsed = parseQrPayload(raw)
    if (!parsed.ok) {
      setTokenError(messageForParseFailure(parsed.reason))
      setTokenId(null)
      return
    }
    setTokenInput(parsed.token)

    startTransition(async () => {
      const res = await validateToken(parsed.token)
      if (!res.ok) {
        setTokenError(res.error)
        setTokenId(null)
        return
      }
      setTokenId(res.tokenId)
      setValidatedToken(res.token)
      setStep(1)
    })
  }

  function handleSelectDiagnosis() {
    if (!diagnosisId) return
    startTransition(async () => {
      const list = await getRoutinesForDiagnosis(diagnosisId)
      setRoutines(list)
      setRoutineId(null)
      setStep(2)
    })
  }

  function handleLoadPreview(id: string) {
    startTransition(async () => {
      const res = await getRoutinePreview(id)
      if (!res) {
        toast.error("Could not load routine")
        return
      }
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const p = res.preview
      setRoutineId(id)
      setPreview(p)
      // Default selection per step.
      const initial: Record<string, string> = {}
      for (const s of p.steps) {
        const fallback = s.defaultProductId ?? s.options[0]?.id ?? ""
        if (fallback) initial[s.stepId] = fallback
      }
      setSelections(initial)
      setStep(3)
    })
  }

  function handleConfirm() {
    if (!tokenId || !routineId || !diagnosisId) return
    startTransition(async () => {
      const res = await confirmAssignment({
        tokenId,
        routineId,
        diagnosisId,
        selections: Object.entries(selections).map(([stepId, productId]) => ({
          stepId,
          productId,
        })),
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Kit assigned")
      setStep(4)
      router.refresh()
    })
  }

  const diagnosisName = diagnoses.find((d) => d.id === diagnosisId)?.name

  const diagnosisOptions: ComboboxOption[] = diagnoses.map((d) => ({
    value: d.id,
    label: d.name,
    keywords: [d.slug],
  }))
  const routineOptions: ComboboxOption[] = routines.map((r) => ({
    value: r.id,
    label: r.name,
    keywords: [r.routineTypeName],
  }))
  const selectedRoutine = routines.find((r) => r.id === routineId) ?? null

  function handleDiagnosisChange(id: string | null) {
    setDiagnosisId(id ?? "")
    // Clear all downstream state so a previous diagnosis cannot leak a stale
    // routine, preview, product selection, or replacement choice into confirm.
    setRoutines([])
    setRoutineId(null)
    setPreview(null)
    setSelections({})
  }

  return (
    <div className="space-y-5">
      <ol aria-label="Assignment progress" className="surface-panel flex items-center gap-1 overflow-x-auto p-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex shrink-0 items-center gap-1">
            <span
              className={
                "flex size-7 items-center justify-center rounded-full font-medium " +
                (i < step
                  ? "bg-success text-success-foreground"
                  : i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground")
              }
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={
                i === step
                  ? "px-1 font-medium text-foreground"
                  : "hidden px-1 text-muted-foreground sm:inline"
              }
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="size-3 text-muted-foreground/50" />}
          </li>
        ))}
      </ol>

      <Card className="min-h-[24rem]">
        {/* STEP 1 — Token */}
        {step === 0 && (
          <>
          <CardHeader>
            <span className="icon-tile mb-2"><ScanLine className="size-5" /></span>
            <CardTitle>Scan or enter a token</CardTitle>
            <CardDescription>Use the printed AOMI Kit code to begin an assignment.</CardDescription>
          </CardHeader>
          <CardContent className="max-w-lg space-y-5">
            <div className="space-y-2">
              <Label htmlFor="token">Scan or enter token</Label>
              <Input
                id="token"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleValidateToken()
                  }
                }}
                placeholder="AOMI-KIT-XXXXXX"
                className="font-mono uppercase"
                disabled={pending}
                autoFocus
              />
              {tokenError && (
                <p role="alert" aria-live="polite" className="text-sm text-destructive">
                  {tokenError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                USB or Bluetooth scanners type into this field — keep it focused and scan.
                The scanner&apos;s Enter keystroke submits automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleValidateToken()} disabled={pending || !tokenInput}>
                {pending && <Spinner />}
                {pending ? "Validating…" : "Validate token"}
              </Button>
              <QrScannerDialog
                onToken={(t) => handleValidateToken(t)}
                disabled={pending}
              />
            </div>
          </CardContent>
          </>
        )}

        {/* STEP 2 — Diagnosis */}
        {step === 1 && (
          <CardContent className="max-w-lg space-y-5 pt-6">
            <div><p className="section-label">Step 2</p><h2 className="mt-1 text-xl font-semibold">Choose a diagnosis</h2><p className="mt-1 text-sm text-muted-foreground">Routines will be filtered to this skin profile.</p></div>
            <div className="space-y-2">
              <Label htmlFor="diagnosis">Select diagnosis</Label>
              <Combobox
                id="diagnosis"
                options={diagnosisOptions}
                value={diagnosisId || null}
                onValueChange={handleDiagnosisChange}
                placeholder="Choose a diagnosis…"
                searchPlaceholder="Search by name or slug…"
                emptyMessage="No matching diagnoses."
                ariaLabel="Select diagnosis"
                clearable
                disabled={pending}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(0)} disabled={pending}>
                Back
              </Button>
              <Button onClick={handleSelectDiagnosis} disabled={pending || !diagnosisId}>
                {pending && <Spinner />}
                {pending ? "Loading…" : "Find routines"}
              </Button>
            </div>
          </CardContent>
        )}

        {/* STEP 3 — Routine */}
        {step === 2 && (
          <CardContent className="space-y-5 pt-6">
            <div><p className="section-label">Step 3</p><h2 className="mt-1 text-xl font-semibold">Select a routine</h2></div>
            <p className="text-sm text-muted-foreground">
              Routines matching <strong>{diagnosisName}</strong>
            </p>
            {routines.length === 0 ? (
              <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                No active routines for this diagnosis.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="routine">Select routine</Label>
                  <Combobox
                    id="routine"
                    options={routineOptions}
                    value={routineId}
                    onValueChange={(id) => {
                      setRoutineId(id)
                      // Routine changed — drop any stale preview/selections.
                      setPreview(null)
                      setSelections({})
                    }}
                    placeholder="Choose a routine…"
                    searchPlaceholder="Search by routine or type…"
                    emptyMessage="No matching routines."
                    ariaLabel="Select routine"
                    disabled={pending}
                  />
                </div>

                {selectedRoutine && (
                  <div className="rounded-3xl border border-border bg-muted/20 p-4">
                    <div className="font-medium">{selectedRoutine.name}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary">{selectedRoutine.routineTypeName}</Badge>
                      <span>{selectedRoutine.stepCount} steps</span>
                      {selectedRoutine.durationDays && (
                        <span>· {selectedRoutine.durationDays} days</span>
                      )}
                    </div>
                    {selectedRoutine.description && (
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        {selectedRoutine.description}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={pending}>
                Back
              </Button>
              <Button
                onClick={() => routineId && handleLoadPreview(routineId)}
                disabled={pending || !routineId}
              >
                {pending && <Spinner />}
                {pending ? "Loading…" : "Review products"}
              </Button>
            </div>
          </CardContent>
        )}

        {/* STEP 4 — Review & replace */}
        {step === 3 && preview && (
          <CardContent className="space-y-5 pt-6">
            <div>
              <p className="section-label">Step 4</p>
              <h3 className="mt-1 text-xl font-semibold">
                {preview.name}
              </h3>
              {preview.generalInstructions && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {preview.generalInstructions}
                </p>
              )}
            </div>

            <ul className="space-y-3">
              {preview.steps.map((s) => (
                <li
                  key={s.stepId}
                  className="rounded-3xl border border-border bg-muted/20 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex aspect-square size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold leading-none text-primary-foreground">
                      {s.stepNumber}
                    </span>
                    <Badge variant="secondary">{s.stepType}</Badge>
                  </div>
                  {s.instruction && (
                    <p className="mb-3 text-sm text-muted-foreground">{s.instruction}</p>
                  )}
                  {s.options.length === 0 ? (
                    <p className="text-sm text-destructive">
                      No products available for this step.
                    </p>
                  ) : (
                    <div className="flex items-center gap-3">
                      {(() => {
                        const selectedId = selections[s.stepId] ?? s.defaultProductId
                        const selected = s.options.find((o) => o.id === selectedId)
                        return selected?.primaryImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selected.primaryImageUrl}
                            alt=""
                            className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-foreground/10"
                          />
                        ) : (
                          <div className="size-10 shrink-0 rounded-lg bg-muted ring-1 ring-foreground/10" aria-hidden />
                        )
                      })()}
                      <Select
                        value={selections[s.stepId] ?? ""}
                        onValueChange={(v) =>
                          setSelections((prev) => ({ ...prev, [s.stepId]: v }))
                        }
                        disabled={pending}
                      >
                        <SelectTrigger className="w-full sm:w-80">
                          <SelectValue placeholder="Select product…" />
                        </SelectTrigger>
                        <SelectContent>
                          {s.options.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.name}
                              {o.id === s.defaultProductId ? " (default)" : ""}
                              {o.isReplacement && o.id !== s.defaultProductId
                                ? " (alt)"
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={pending}>
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  pending ||
                  preview.steps.some((s) => !selections[s.stepId])
                }
              >
                {pending && <Spinner />}
                {pending ? "Assigning…" : "Confirm assignment"}
              </Button>
            </div>
          </CardContent>
        )}

        {/* STEP 5 — Done */}
        {step === 4 && (
          <CardContent className="space-y-5 py-12 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success text-success-foreground">
              <Check className="size-6" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">
                Kit assigned
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Token{" "}
                <span className="font-mono">{validatedToken}</span> is now
                assigned.
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button
                onClick={() => {
                  // Reset for another assignment.
                  setStep(0)
                  setTokenInput("")
                  setTokenId(null)
                  setValidatedToken(null)
                  setDiagnosisId("")
                  setRoutines([])
                  setRoutineId(null)
                  setPreview(null)
                  setSelections({})
                }}
              >
                Assign another
              </Button>
              <Button variant="outline" onClick={() => router.push("/seller")}>
                Done
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
