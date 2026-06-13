"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SheetFooter } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ProductActionState } from "../actions"
import type { Product } from "@/generated/prisma/client"
import Link from "next/link"
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

type Props = {
  action: (
    prevState: ProductActionState,
    formData: FormData
  ) => Promise<ProductActionState>
  defaultValues?: Pick<
    Product,
    "name" | "sku" | "category" | "functionDescription" | "stepType"
  >
}

export default function ProductForm({ action, defaultValues }: Props) {
  const [state, formAction, pending] = useActionState(action, {})

  return (
    <form action={formAction} className="flex flex-1 flex-col min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Section: Identity */}
        <div className="space-y-4">
          <h3 className="section-label">Product Identity</h3>
          <div className="grid gap-5 md:grid-cols-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={defaultValues?.name ?? ""}
                disabled={pending}
                aria-invalid={!!state.errors?.name}
              />
              {state.errors?.name?.[0] && (
                <p className="field-error">
                  {state.errors.name[0]}
                </p>
              )}
            </div>

            {/* SKU */}
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                name="sku"
                defaultValue={defaultValues?.sku ?? ""}
                placeholder="e.g. AOMI-CLN-001"
                disabled={pending}
                aria-invalid={!!state.errors?.sku}
              />
              {state.errors?.sku?.[0] && (
                <p className="field-error">
                  {state.errors.sku[0]}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section: Classification */}
        <div className="space-y-4 pt-2">
          <h3 className="section-label">Classification & Category</h3>
          <div className="grid gap-5 md:grid-cols-2">
            {/* Step Type */}
            <div className="space-y-2">
              <Label htmlFor="stepType">
                Step Type <span className="text-destructive">*</span>
              </Label>
              <Select
                name="stepType"
                defaultValue={defaultValues?.stepType ?? ""}
                disabled={pending}
              >
                <SelectTrigger id="stepType" className="w-full" aria-invalid={!!state.errors?.stepType}>
                  <SelectValue placeholder="Select step type…" />
                </SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.errors?.stepType?.[0] && (
                <p className="field-error">
                  {state.errors.stepType[0]}
                </p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                name="category"
                defaultValue={defaultValues?.category ?? ""}
                placeholder="e.g. Cleanser"
                disabled={pending}
              />
            </div>
          </div>
        </div>

        {/* Section: Function */}
        <div className="space-y-4 pt-2">
          <h3 className="section-label">Function Description</h3>
          {/* Function Description */}
          <div className="space-y-2">
            <Label htmlFor="functionDescription">Description</Label>
            <Textarea
              id="functionDescription"
              name="functionDescription"
              defaultValue={defaultValues?.functionDescription ?? ""}
              placeholder="Describe what this product does…"
              disabled={pending}
              rows={4}
              className="min-h-[100px] resize-y"
            />
            {state.errors?.functionDescription?.[0] && (
              <p className="field-error">
                {state.errors.functionDescription[0]}
              </p>
            )}
          </div>
        </div>
      </div>

      <SheetFooter className="shrink-0 flex-row items-center justify-end gap-3 border-t border-border/70 bg-card px-6 py-4">
        <Button variant="outline" size="sm" asChild disabled={pending}>
          <Link href="/admin/products">Cancel</Link>
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Saving…" : defaultValues ? "Save Changes" : "Create Product"}
        </Button>
      </SheetFooter>
    </form>
  )
}
