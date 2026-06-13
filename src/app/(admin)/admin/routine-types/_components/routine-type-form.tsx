"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SheetFooter } from "@/components/ui/sheet"
import { toSlug } from "@/lib/slug"
import type { RoutineTypeActionState } from "../actions"
import type { RoutineType } from "@/generated/prisma/client"
import Link from "next/link"
import { Spinner } from "@/components/ui/spinner"

type Props = {
  action: (
    prevState: RoutineTypeActionState,
    formData: FormData
  ) => Promise<RoutineTypeActionState>
  editItem?: Pick<RoutineType, "id" | "name" | "slug">
}

export default function RoutineTypeForm({ action, editItem }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const [slug, setSlug] = useState(editItem?.slug ?? "")
  const [slugTouched, setSlugTouched] = useState(!!editItem)

  return (
    <form action={formAction} className="flex flex-1 flex-col min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor={`rt-name-${editItem?.id ?? "new"}`}>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`rt-name-${editItem?.id ?? "new"}`}
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
            <Label htmlFor={`rt-slug-${editItem?.id ?? "new"}`}>
              Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`rt-slug-${editItem?.id ?? "new"}`}
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
        </div>
      </div>

      <SheetFooter className="shrink-0 flex-row items-center justify-end gap-3 border-t border-border/70 bg-card px-6 py-4">
        <Button variant="outline" size="sm" asChild disabled={pending}>
          <Link href="/admin/routine-types">Cancel</Link>
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Saving…" : editItem ? "Save Changes" : "Create Routine Type"}
        </Button>
      </SheetFooter>
    </form>
  )
}
