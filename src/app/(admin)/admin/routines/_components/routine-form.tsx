"use client"

import { useActionState, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RoutineActionState } from "../actions"
import { SheetFooter } from "@/components/ui/sheet"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

const STEP_TYPES = [
  "CLEANSER",
  "TONER",
  "SERUM",
  "CREAM",
  "SUNSCREEN",
  "EXFOLIANT",
  "TREATMENT",
  "MOISTURIZER",
] as const

type Step = {
  key: string
  stepType: string
  defaultProductId: string
  instruction: string
}

export type RoutineFormDefaults = {
  name: string
  description: string | null
  routineTypeId: string
  durationDays: number | null
  generalInstructions: string | null
  active: boolean
  diagnosisIds: string[]
  steps: {
    stepType: string
    defaultProductId: string | null
    instruction: string | null
  }[]
}

type Props = {
  action: (
    prevState: RoutineActionState,
    formData: FormData
  ) => Promise<RoutineActionState>
  routineTypes: { id: string; name: string }[]
  diagnoses: { id: string; name: string }[]
  products: { id: string; name: string; stepType: string }[]
  defaults?: RoutineFormDefaults
  submitLabel: string
}

let counter = 0
function nextKey() {
  counter += 1
  return `s${counter}`
}

export default function RoutineForm({
  action,
  routineTypes,
  diagnoses,
  products,
  defaults,
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const formRef = useRef<HTMLFormElement>(null)

  const [name, setName] = useState(defaults?.name ?? "")
  const [description, setDescription] = useState(defaults?.description ?? "")
  const [routineTypeId, setRoutineTypeId] = useState(
    defaults?.routineTypeId ?? ""
  )
  const [durationDays, setDurationDays] = useState(
    defaults?.durationDays != null ? String(defaults.durationDays) : ""
  )
  const [generalInstructions, setGeneralInstructions] = useState(
    defaults?.generalInstructions ?? ""
  )
  const [active, setActive] = useState(defaults?.active ?? true)
  const [diagnosisIds, setDiagnosisIds] = useState<string[]>(
    defaults?.diagnosisIds ?? []
  )
  const [steps, setSteps] = useState<Step[]>(
    defaults?.steps?.map((s) => ({
      key: nextKey(),
      stepType: s.stepType,
      defaultProductId: s.defaultProductId ?? "",
      instruction: s.instruction ?? "",
    })) ?? [
      { key: nextKey(), stepType: "CLEANSER", defaultProductId: "", instruction: "" },
    ]
  )

  function toggleDiagnosis(id: string) {
    setDiagnosisIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        key: nextKey(),
        stepType: "CLEANSER",
        defaultProductId: "",
        instruction: "",
      },
    ])
  }

  function removeStep(key: string) {
    setSteps((prev) => prev.filter((s) => s.key !== key))
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function updateStep(key: string, patch: Partial<Step>) {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s))
    )
  }

  const payload = {
    name,
    description: description || null,
    routineTypeId,
    durationDays: durationDays ? Number(durationDays) : null,
    generalInstructions: generalInstructions || null,
    active,
    diagnosisIds,
    steps: steps.map((s) => ({
      stepType: s.stepType,
      defaultProductId: s.defaultProductId || null,
      instruction: s.instruction || null,
    })),
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-1 flex-col min-h-0">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {state.error && (
          <div role="alert" aria-live="polite" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <div className="form-section">
          <h3 className="section-label">Routine Basics</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">
                Name <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="routineTypeId">
                Routine type <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Select
                value={routineTypeId}
                onValueChange={setRoutineTypeId}
                disabled={pending}
              >
                <SelectTrigger id="routineTypeId" className="w-full">
                  <SelectValue placeholder="Select routine type…" />
                </SelectTrigger>
                <SelectContent>
                  {routineTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="durationDays">Duration (days)</Label>
              <Input
                id="durationDays"
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                disabled={pending}
                placeholder="e.g. 30"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
                rows={2}
                className="min-h-[60px]"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="generalInstructions">General instructions</Label>
              <Textarea
                id="generalInstructions"
                value={generalInstructions}
                onChange={(e) => setGeneralInstructions(e.target.value)}
                disabled={pending}
                rows={3}
                className="min-h-[80px]"
              />
            </div>

            <div className="flex items-center gap-2 sm:col-span-2 pt-1">
              <input
                id="active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={pending}
                className="size-4 rounded border-border accent-primary"
              />
              <Label htmlFor="active" className="cursor-pointer text-sm font-normal">
                Active template
              </Label>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-label">Associated Diagnoses</h3>
          <div className="space-y-2">
            {diagnoses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active diagnoses available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {diagnoses.map((d) => {
                  const checked = diagnosisIds.includes(d.id)
                  return (
                    <label
                      key={d.id}
                      className={
                        "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all focus-within:ring-3 focus-within:ring-ring/30 " +
                        (checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted")
                      }
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleDiagnosis(d.id)}
                        disabled={pending}
                      />
                      {d.name}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="form-section">
          <div className="flex items-center justify-between">
            <h3 className="section-label">Routine Steps</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addStep}
              disabled={pending}
            >
              Add step
            </Button>
          </div>

          <div className="space-y-4">
            {steps.map((step, index) => {
              const stepProducts = products.filter(
                (p) => p.stepType === step.stepType
              )
              return (
                <div
                  key={step.key}
                  className="space-y-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5"
                >
                  <div className="flex items-center justify-between border-b border-border/70 pb-3">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{index + 1}</span>
                      Routine step
                    </span>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => moveStep(index, -1)}
                            disabled={index === 0 || pending}
                            aria-label="Move step up"
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Move up</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => moveStep(index, 1)}
                            disabled={index === steps.length - 1 || pending}
                            aria-label="Move step down"
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Move down</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeStep(step.key)}
                            disabled={steps.length === 1 || pending}
                            aria-label="Remove step"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove step</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Step Type</Label>
                      <Select
                        value={step.stepType}
                        onValueChange={(v) =>
                          updateStep(step.key, {
                            stepType: v,
                            defaultProductId: "",
                          })
                        }
                        disabled={pending}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STEP_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.charAt(0) + t.slice(1).toLowerCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Default Product</Label>
                      <Select
                        value={step.defaultProductId || "__none__"}
                        onValueChange={(v) =>
                          updateStep(step.key, {
                            defaultProductId: v === "__none__" ? "" : v,
                          })
                        }
                        disabled={pending}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {stepProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-xs font-medium">Instruction</Label>
                      <Textarea
                        value={step.instruction}
                        onChange={(e) =>
                          updateStep(step.key, { instruction: e.target.value })
                        }
                        disabled={pending}
                        rows={2}
                        className="min-h-[60px]"
                        placeholder="How to use this step…"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <SheetFooter className="shrink-0 flex-row items-center justify-end gap-3 border-t border-border/70 bg-card px-6 py-4">
        <Button variant="outline" size="sm" asChild disabled={pending}>
          <Link href="/admin/routines">Cancel</Link>
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Saving…" : submitLabel}
        </Button>
      </SheetFooter>
    </form>
  )
}
