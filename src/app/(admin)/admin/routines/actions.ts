"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"
import { writeAuditLog } from "@/lib/audit"
import type { StepType } from "@/generated/prisma/client"

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

const StepSchema = z.object({
  stepType: z.enum(STEP_TYPES),
  defaultProductId: z.string().optional().nullable(),
  instruction: z.string().max(2000).optional().nullable(),
})

const RoutineSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  routineTypeId: z.string().min(1, "Routine type is required"),
  durationDays: z.coerce.number().int().positive().optional().nullable(),
  generalInstructions: z.string().max(4000).optional().nullable(),
  active: z.boolean(),
  diagnosisIds: z.array(z.string()),
  steps: z.array(StepSchema).min(1, "Add at least one step"),
})

export type RoutineActionState = { error?: string; fieldErrors?: Record<string, string> }

function parsePayload(formData: FormData) {
  const raw = formData.get("payload")
  if (typeof raw !== "string") return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeSteps(
  steps: z.infer<typeof StepSchema>[]
): {
  stepNumber: number
  stepType: StepType
  defaultProductId: string | null
  instruction: string | null
}[] {
  return steps.map((s, idx) => ({
    stepNumber: idx + 1,
    stepType: s.stepType as StepType,
    defaultProductId: s.defaultProductId || null,
    instruction: s.instruction || null,
  }))
}

// Validates diagnosis IDs, product IDs, and product/step type alignment.
// Returns a field-error string on failure, null on success.
async function validateNestedRefs(
  diagnosisIds: string[],
  steps: z.infer<typeof StepSchema>[]
): Promise<string | null> {
  // Duplicate diagnosis IDs.
  if (new Set(diagnosisIds).size !== diagnosisIds.length) {
    return "Duplicate diagnosis selected"
  }

  // All diagnosis IDs must exist and be active.
  if (diagnosisIds.length > 0) {
    const diagnoses = await prisma.diagnosis.findMany({
      where: { id: { in: diagnosisIds } },
      select: { id: true, active: true, name: true },
    })
    const diagMap = new Map(diagnoses.map((d) => [d.id, d]))
    for (const id of diagnosisIds) {
      const d = diagMap.get(id)
      if (!d) return `Diagnosis not found: ${id}`
      if (!d.active) return `Diagnosis "${d.name}" is inactive`
    }
  }

  // Collect unique product IDs referenced by steps.
  const productIds = Array.from(
    new Set(steps.map((s) => s.defaultProductId).filter((id): id is string => !!id))
  )

  if (productIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, active: true, name: true, stepType: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    for (const step of steps) {
      if (!step.defaultProductId) continue
      const p = productMap.get(step.defaultProductId)
      if (!p) return `Product not found: ${step.defaultProductId}`
      if (!p.active) return `Product "${p.name}" is inactive`
      if (p.stepType !== step.stepType) {
        return `Product "${p.name}" has step type ${p.stepType} but is assigned to a ${step.stepType} step`
      }
    }
  }

  return null
}

export async function createRoutine(
  _prevState: RoutineActionState,
  formData: FormData
): Promise<RoutineActionState> {
  const session = await requireRole("ADMIN")

  const payload = parsePayload(formData)
  const parsed = RoutineSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const data = parsed.data

  const routineType = await prisma.routineType.findUnique({
    where: { id: data.routineTypeId },
    select: { id: true },
  })
  if (!routineType) return { error: "Selected routine type does not exist" }

  const nestedError = await validateNestedRefs(data.diagnosisIds, data.steps)
  if (nestedError) return { error: nestedError }

  const steps = normalizeSteps(data.steps)

  const created = await prisma.routineTemplate.create({
    data: {
      name: data.name,
      description: data.description || null,
      routineTypeId: data.routineTypeId,
      durationDays: data.durationDays ?? null,
      generalInstructions: data.generalInstructions || null,
      active: data.active,
      diagnoses: {
        create: data.diagnosisIds.map((diagnosisId) => ({ diagnosisId })),
      },
      steps: { create: steps },
    },
  })

  await writeAuditLog(session.user.id, "CREATE", "RoutineTemplate", created.id, {
    name: created.name,
  })

  revalidatePath("/admin/routines")
  redirect(`/admin/routines/${created.id}`)
}

export async function updateRoutine(
  id: string,
  _prevState: RoutineActionState,
  formData: FormData
): Promise<RoutineActionState> {
  const session = await requireRole("ADMIN")

  const payload = parsePayload(formData)
  const parsed = RoutineSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const data = parsed.data

  const existing = await prisma.routineTemplate.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) return { error: "Routine not found" }

  const routineType = await prisma.routineType.findUnique({
    where: { id: data.routineTypeId },
    select: { id: true },
  })
  if (!routineType) return { error: "Selected routine type does not exist" }

  const nestedError = await validateNestedRefs(data.diagnosisIds, data.steps)
  if (nestedError) return { error: nestedError }

  const steps = normalizeSteps(data.steps)

  // Replace steps and diagnoses wholesale inside a transaction.
  await prisma.$transaction([
    prisma.routineTemplate.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description || null,
        routineTypeId: data.routineTypeId,
        durationDays: data.durationDays ?? null,
        generalInstructions: data.generalInstructions || null,
        active: data.active,
      },
    }),
    prisma.routineTemplateStep.deleteMany({ where: { routineTemplateId: id } }),
    prisma.routineTemplateDiagnosis.deleteMany({
      where: { routineTemplateId: id },
    }),
    prisma.routineTemplateStep.createMany({
      data: steps.map((s) => ({ ...s, routineTemplateId: id })),
    }),
    prisma.routineTemplateDiagnosis.createMany({
      data: data.diagnosisIds.map((diagnosisId) => ({
        routineTemplateId: id,
        diagnosisId,
      })),
    }),
  ])

  await writeAuditLog(session.user.id, "UPDATE", "RoutineTemplate", id, {
    name: data.name,
  })

  revalidatePath("/admin/routines")
  revalidatePath(`/admin/routines/${id}`)
  redirect(`/admin/routines/${id}`)
}

export async function toggleRoutineActive(formData: FormData) {
  const session = await requireRole("ADMIN")
  const id = formData.get("id") as string

  const routine = await prisma.routineTemplate.findUnique({
    where: { id },
    select: { active: true, name: true },
  })
  if (!routine) return

  const next = !routine.active
  await prisma.routineTemplate.update({ where: { id }, data: { active: next } })

  await writeAuditLog(
    session.user.id,
    next ? "ACTIVATE" : "DEACTIVATE",
    "RoutineTemplate",
    id,
    { name: routine.name }
  )

  revalidatePath("/admin/routines")
  revalidatePath(`/admin/routines/${id}`)
}
