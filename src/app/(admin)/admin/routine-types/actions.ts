"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"
import { writeAuditLog } from "@/lib/audit"

const RoutineTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
})

export type RoutineTypeActionState = {
  errors?: {
    name?: string[]
    slug?: string[]
  }
}

export async function createRoutineType(
  prevState: RoutineTypeActionState,
  formData: FormData
): Promise<RoutineTypeActionState> {
  const session = await requireRole("ADMIN")

  const parsed = RoutineTypeSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const existing = await prisma.routineType.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  })
  if (existing) return { errors: { slug: ["Slug already in use"] } }

  const rt = await prisma.routineType.create({
    data: { name: parsed.data.name, slug: parsed.data.slug },
  })

  await writeAuditLog(session.user.id, "CREATE", "RoutineType", rt.id, {
    name: rt.name,
  })

  revalidatePath("/admin/routine-types")
  redirect("/admin/routine-types")
}

export async function updateRoutineType(
  id: string,
  prevState: RoutineTypeActionState,
  formData: FormData
): Promise<RoutineTypeActionState> {
  const session = await requireRole("ADMIN")

  const parsed = RoutineTypeSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const conflict = await prisma.routineType.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  })
  if (conflict && conflict.id !== id) {
    return { errors: { slug: ["Slug already in use"] } }
  }

  await prisma.routineType.update({
    where: { id },
    data: { name: parsed.data.name, slug: parsed.data.slug },
  })

  await writeAuditLog(session.user.id, "UPDATE", "RoutineType", id, {
    name: parsed.data.name,
  })

  revalidatePath("/admin/routine-types")
  redirect("/admin/routine-types")
}

export async function toggleRoutineTypeActive(formData: FormData): Promise<{ error?: string; ok?: boolean } | void> {
  const session = await requireRole("ADMIN")
  const id = formData.get("id") as string

  const rt = await prisma.routineType.findUnique({
    where: { id },
    select: { active: true, name: true },
  })
  if (!rt) return { error: "Routine type not found" }

  const next = !rt.active

  if (!next) {
    const activeUsages = await prisma.routineTemplate.count({
      where: {
        routineTypeId: id,
        active: true
      }
    })
    if (activeUsages > 0) {
      return { error: `Cannot deactivate: This routine type is used by ${activeUsages} active routine${activeUsages !== 1 ? 's' : ''}.` }
    }
  }

  await prisma.routineType.update({ where: { id }, data: { active: next } })

  await writeAuditLog(
    session.user.id,
    next ? "ACTIVATE" : "DEACTIVATE",
    "RoutineType",
    id,
    { name: rt.name }
  )

  revalidatePath("/admin/routine-types")
  return { ok: true }
}
