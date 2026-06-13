"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SheetFooter } from "@/components/ui/sheet"
import { toSlug } from "@/lib/slug"
import type { DiagnosisActionState } from "../actions"
import type { Diagnosis } from "@/generated/prisma/client"
import Link from "next/link"
import { Spinner } from "@/components/ui/spinner"

type Props = {
  action: (
    prevState: DiagnosisActionState,
    formData: FormData
  ) => Promise<DiagnosisActionState>
  editItem?: Pick<Diagnosis, "id" | "name" | "slug" | "description">
}

export default function DiagnosisForm({ action, editItem }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const [slug, setSlug] = useState(editItem?.slug ?? "")
  const [slugTouched, setSlugTouched] = useState(!!editItem)

  return (
    <form action={formAction} className="flex flex-1 flex-col min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor={`name-${editItem?.id ?? "new"}`}>
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`name-${editItem?.id ?? "new"}`}
            name="name"
            defaultValue={editItem?.name ?? ""}
            disabled={pending}
            aria-invalid={!!state.errors?.name}
            onChange={(e) => {
              if (!slugTouched) setSlug(toSlug(e.target.value))
            }}
          />
          {state.errors?.name?.[0] && (
            <p className="field-error">
              {state.errors.name[0]}
            </p>
          )}
        </div>

        {/* Slug */}
        <div className="space-y-2">
          <Label htmlFor={`slug-${editItem?.id ?? "new"}`}>
            Slug <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`slug-${editItem?.id ?? "new"}`}
            name="slug"
            value={slug}
            disabled={pending}
            aria-invalid={!!state.errors?.slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
          />
          {state.errors?.slug?.[0] && (
            <p className="field-error">
              {state.errors.slug[0]}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor={`description-${editItem?.id ?? "new"}`}>
            Description
          </Label>
          <Textarea
            id={`description-${editItem?.id ?? "new"}`}
            name="description"
            defaultValue={editItem?.description ?? ""}
            placeholder="Optional description…"
            disabled={pending}
            rows={4}
            className="min-h-[100px] resize-y"
          />
          {state.errors?.description?.[0] && (
            <p className="field-error">
              {state.errors.description[0]}
            </p>
          )}
        </div>
      </div>

      <SheetFooter className="shrink-0 flex-row items-center justify-end gap-3 border-t border-border/70 bg-card px-6 py-4">
        <Button variant="outline" size="sm" asChild disabled={pending}>
          <Link href="/admin/diagnoses">Cancel</Link>
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Saving…" : editItem ? "Save Changes" : "Create Diagnosis"}
        </Button>
      </SheetFooter>
    </form>
  )
}
