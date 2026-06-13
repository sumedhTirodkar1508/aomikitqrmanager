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

type Diagnosis = { id: string; name: string }

const STEPS = ["Token", "Diagnosis", "Routine", "Review", "Confirm"]

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

  function handleValidateToken() {
    setTokenError(null)
    startTransition(async () => {
      const res = await validateToken(tokenInput)
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

  function handleSelectRoutine(id: string) {
    startTransition(async () => {
      const p = await getRoutinePreview(id)
      if (!p) {
        toast.error("Could not load routine")
        return
      }
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
    if (!tokenId || !routineId) return
    startTransition(async () => {
      const res = await confirmAssignment({
        tokenId,
        routineId,
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
            </div>
            <Button onClick={handleValidateToken} disabled={pending || !tokenInput}>
              {pending && <Spinner />}
              {pending ? "Validating…" : "Validate token"}
            </Button>
          </CardContent>
          </>
        )}

        {/* STEP 2 — Diagnosis */}
        {step === 1 && (
          <CardContent className="max-w-lg space-y-5 pt-6">
            <div><p className="section-label">Step 2</p><h2 className="mt-1 text-xl font-semibold">Choose a diagnosis</h2><p className="mt-1 text-sm text-muted-foreground">Routines will be filtered to this skin profile.</p></div>
            <div className="space-y-2">
              <Label htmlFor="diagnosis">Select diagnosis</Label>
              <Select
                value={diagnosisId}
                onValueChange={setDiagnosisId}
                disabled={pending}
              >
                <SelectTrigger id="diagnosis" className="w-full">
                  <SelectValue placeholder="Choose a diagnosis…" />
                </SelectTrigger>
                <SelectContent>
                  {diagnoses.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <div className="grid gap-3 sm:grid-cols-2">
                {routines.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRoutine(r.id)}
                    disabled={pending}
                    className="rounded-3xl border border-border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
                  >
                    <div className="font-medium">
                      {r.name}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary">{r.routineTypeName}</Badge>
                      <span>{r.stepCount} steps</span>
                      {r.durationDays && <span>· {r.durationDays} days</span>}
                    </div>
                    {r.description && (
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
            <Button variant="ghost" onClick={() => setStep(1)} disabled={pending}>
              Back
            </Button>
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
                    <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      Step {s.stepNumber}
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
