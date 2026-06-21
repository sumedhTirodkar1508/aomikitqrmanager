"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"
import { writeAuditLog } from "@/lib/audit"

const DiagnosisSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().max(1000).optional(),
})

export type DiagnosisActionState = {
  errors?: {
    name?: string[]
    slug?: string[]
    description?: string[]
  }
}

export async function createDiagnosis(
  prevState: DiagnosisActionState,
  formData: FormData
): Promise<DiagnosisActionState> {
  const session = await requireRole("ADMIN")

  const parsed = DiagnosisSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: (formData.get("description") as string) || undefined,
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const existing = await prisma.diagnosis.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  })
  if (existing) return { errors: { slug: ["Slug already in use"] } }

  const diagnosis = await prisma.diagnosis.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
    },
  })

  await writeAuditLog(session.user.id, "CREATE", "Diagnosis", diagnosis.id, {
    name: diagnosis.name,
  })

  revalidatePath("/admin/diagnoses")
  redirect("/admin/diagnoses")
}

export async function updateDiagnosis(
  id: string,
  prevState: DiagnosisActionState,
  formData: FormData
): Promise<DiagnosisActionState> {
  const session = await requireRole("ADMIN")

  const parsed = DiagnosisSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: (formData.get("description") as string) || undefined,
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const conflict = await prisma.diagnosis.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  })
  if (conflict && conflict.id !== id) {
    return { errors: { slug: ["Slug already in use"] } }
  }

  await prisma.diagnosis.update({
    where: { id },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
    },
  })

  await writeAuditLog(session.user.id, "UPDATE", "Diagnosis", id, {
    name: parsed.data.name,
  })

  revalidatePath("/admin/diagnoses")
  redirect("/admin/diagnoses")
}

export async function toggleDiagnosisActive(formData: FormData): Promise<{ error?: string; ok?: boolean } | void> {
  const session = await requireRole("ADMIN")
  const id = formData.get("id") as string

  const diagnosis = await prisma.diagnosis.findUnique({
    where: { id },
    select: { active: true, name: true },
  })
  if (!diagnosis) return { error: "Diagnosis not found" }

  const next = !diagnosis.active

  if (!next) {
    const activeUsages = await prisma.routineTemplateDiagnosis.count({
      where: {
        diagnosisId: id,
        template: { active: true }
      }
    })
    if (activeUsages > 0) {
      return { error: `Cannot deactivate: This diagnosis is used by ${activeUsages} active routine${activeUsages !== 1 ? 's' : ''}.` }
    }
  }

  await prisma.diagnosis.update({ where: { id }, data: { active: next } })

  await writeAuditLog(
    session.user.id,
    next ? "ACTIVATE" : "DEACTIVATE",
    "Diagnosis",
    id,
    { name: diagnosis.name }
  )

  revalidatePath("/admin/diagnoses")
  return { ok: true }
}
