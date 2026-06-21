"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAnyRole } from "@/lib/auth-helpers"
import { writeAuditLog } from "@/lib/audit"
import { normalizeToken, isValidTokenFormat } from "@/lib/token"
import type { StepType } from "@/generated/prisma/client"

// ─── Step 1: validate token ──────────────────────────────────────────────────

export type ValidateTokenResult =
  | { ok: true; tokenId: string; token: string }
  | { ok: false; error: string }

export async function validateToken(raw: string): Promise<ValidateTokenResult> {
  await requireAnyRole("SELLER", "ADMIN")

  const token = normalizeToken(raw ?? "")
  if (!token) return { ok: false, error: "Enter a token" }
  if (!isValidTokenFormat(token)) {
    return { ok: false, error: "That doesn't look like a valid token" }
  }

  const record = await prisma.qRToken.findUnique({
    where: { token },
    select: { id: true, token: true, status: true },
  })

  if (!record) return { ok: false, error: "Token not found" }
  if (record.status !== "AVAILABLE") {
    return {
      ok: false,
      error: `Token is ${record.status.toLowerCase()} and cannot be assigned`,
    }
  }

  return { ok: true, tokenId: record.id, token: record.token }
}

// ─── Step 3: routines for a diagnosis ────────────────────────────────────────

export type RoutineOption = {
  id: string
  name: string
  description: string | null
  durationDays: number | null
  routineTypeName: string
  stepCount: number
}

export async function getRoutinesForDiagnosis(
  diagnosisId: string
): Promise<RoutineOption[]> {
  await requireAnyRole("SELLER", "ADMIN")
  if (!diagnosisId) return []

  const routines = await prisma.routineTemplate.findMany({
    where: {
      active: true,
      diagnoses: { some: { diagnosisId } },
    },
    orderBy: { name: "asc" },
    include: {
      routineType: { select: { name: true } },
      _count: { select: { steps: true } },
    },
  })

  return routines.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    durationDays: r.durationDays,
    routineTypeName: r.routineType.name,
    stepCount: r._count.steps,
  }))
}

// ─── Step 4: routine preview with replacement options ────────────────────────

export type StepProductOption = {
  id: string
  name: string
  sku: string | null
  isReplacement: boolean
  primaryImageUrl: string | null
}

export type RoutineStepPreview = {
  stepId: string
  stepNumber: number
  stepType: string
  instruction: string | null
  defaultProductId: string | null
  defaultProductName: string | null
  options: StepProductOption[]
}

export type RoutinePreview = {
  id: string
  name: string
  generalInstructions: string | null
  steps: RoutineStepPreview[]
}

export type RoutinePreviewResult =
  | { ok: true; preview: RoutinePreview }
  | { ok: false; error: string }

// Internal: builds the authoritative preview data without an auth check.
// Called from both getRoutinePreview (which adds auth) and confirmAssignment
// (which has already verified auth) so the option-building logic stays in one place.
async function loadRoutinePreviewData(routineId: string): Promise<RoutinePreviewResult | null> {
  const routine = await prisma.routineTemplate.findUnique({
    where: { id: routineId },
    include: {
      steps: {
        orderBy: { stepNumber: "asc" },
        include: {
          defaultProduct: { select: { id: true, name: true, sku: true, active: true, stepType: true } },
        },
      },
    },
  })
  if (!routine || !routine.active) return null

  // Gather replacement rules for all default products in one query.
  const defaultProductIds = routine.steps
    .map((s) => s.defaultProductId)
    .filter((id): id is string => !!id)

  const replacementRules = defaultProductIds.length
    ? await prisma.productReplacement.findMany({
        where: { sourceProductId: { in: defaultProductIds }, active: true },
        include: {
          replacement: { select: { id: true, name: true, sku: true, active: true, stepType: true } },
        },
      })
    : []

  // Collect all product IDs that will appear as options, then batch-fetch their
  // primary images in one query to avoid N+1.
  const allOptionIds = new Set<string>()
  for (const step of routine.steps) {
    if (step.defaultProductId) allOptionIds.add(step.defaultProductId)
  }
  for (const rule of replacementRules) {
    if (rule.replacement.active) allOptionIds.add(rule.replacement.id)
  }

  const primaryImages = await prisma.productImage.findMany({
    where: { productId: { in: Array.from(allOptionIds) } },
    orderBy: { sortOrder: "asc" },
    select: { productId: true, imageUrl: true },
  })
  // Keep only the first image per product (lowest sortOrder).
  const primaryImageMap = new Map<string, string>()
  for (const img of primaryImages) {
    if (!primaryImageMap.has(img.productId)) {
      primaryImageMap.set(img.productId, img.imageUrl)
    }
  }

  const steps: RoutineStepPreview[] = []
  for (const step of routine.steps) {
    if (!step.defaultProductId || !step.defaultProduct) {
      return { ok: false, error: `Step ${step.stepNumber} is missing a default product and cannot be assigned.` }
    }
    if (!step.defaultProduct.active) {
      return { ok: false, error: `Step ${step.stepNumber} uses an inactive default product and cannot be assigned.` }
    }

    const options = new Map<string, StepProductOption>()

    // Default product is active, add it.
    options.set(step.defaultProduct.id, {
      id: step.defaultProduct.id,
      name: step.defaultProduct.name,
      sku: step.defaultProduct.sku,
      isReplacement: false,
      primaryImageUrl: primaryImageMap.get(step.defaultProduct.id) ?? null,
    })

    // Explicit replacement rules for this step's default product.
    for (const rule of replacementRules) {
      if (rule.sourceProductId !== step.defaultProductId) continue
      if (!rule.replacement.active) continue
      if (rule.replacement.stepType !== step.defaultProduct.stepType) continue
      if (rule.stepType !== step.defaultProduct.stepType) continue
      if (options.has(rule.replacement.id)) continue

      options.set(rule.replacement.id, {
        id: rule.replacement.id,
        name: rule.replacement.name,
        sku: rule.replacement.sku,
        isReplacement: true,
        primaryImageUrl: primaryImageMap.get(rule.replacement.id) ?? null,
      })
    }

    steps.push({
      stepId: step.id,
      stepNumber: step.stepNumber,
      stepType: step.stepType,
      instruction: step.instruction,
      defaultProductId: step.defaultProductId,
      defaultProductName: step.defaultProduct.name,
      options: Array.from(options.values()),
    })
  }

  return {
    ok: true,
    preview: {
      id: routine.id,
      name: routine.name,
      generalInstructions: routine.generalInstructions,
      steps,
    },
  }
}

export async function getRoutinePreview(
  routineId: string
): Promise<RoutinePreviewResult | null> {
  await requireAnyRole("SELLER", "ADMIN")
  return loadRoutinePreviewData(routineId)
}

// ─── Step 5: confirm assignment (transactional) ──────────────────────────────

const ConfirmSchema = z.object({
  tokenId: z.string().min(1),
  routineId: z.string().min(1),
  diagnosisId: z.string().min(1),
  selections: z.array(
    z.object({
      stepId: z.string().min(1),
      productId: z.string().min(1),
    })
  ),
})

export type ConfirmResult =
  | { ok: true; packageId: string }
  | { ok: false; error: string }

export async function confirmAssignment(input: unknown): Promise<ConfirmResult> {
  const { user } = await requireAnyRole("SELLER", "ADMIN")

  const parsed = ConfirmSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Invalid assignment data" }
  }
  const { tokenId, routineId, diagnosisId, selections } = parsed.data

  // Re-compute authoritative options from the database — do not trust client-supplied
  // product/step combinations.
  const res = await loadRoutinePreviewData(routineId)
  if (!res) {
    return { ok: false, error: "Routine is no longer available" }
  }
  if (!res.ok) {
    return { ok: false, error: res.error }
  }
  const preview = res.preview

  // Verify the diagnosis is active and linked to this routine at commit time.
  // A single query handles unknown diagnosis, unlinked diagnosis, and inactive diagnosis.
  const diagnosisLink = await prisma.routineTemplateDiagnosis.findUnique({
    where: {
      routineTemplateId_diagnosisId: {
        routineTemplateId: routineId,
        diagnosisId,
      },
    },
    select: { diagnosis: { select: { active: true } } },
  })
  if (!diagnosisLink) {
    return { ok: false, error: "Diagnosis is not associated with this routine" }
  }
  if (!diagnosisLink.diagnosis.active) {
    return { ok: false, error: "Diagnosis is no longer active" }
  }

  // 1. Reject duplicate step IDs in the submission.
  const submittedStepIds = selections.map((s) => s.stepId)
  if (new Set(submittedStepIds).size !== submittedStepIds.length) {
    return { ok: false, error: "Duplicate step in selection" }
  }

  // 2. Verify every required step is present and no unknown steps were submitted.
  const requiredStepIds = new Set(preview.steps.map((s) => s.stepId))
  const submittedStepIdSet = new Set(submittedStepIds)
  for (const id of requiredStepIds) {
    if (!submittedStepIdSet.has(id)) {
      return { ok: false, error: "Missing step in selection" }
    }
  }
  for (const id of submittedStepIdSet) {
    if (!requiredStepIds.has(id)) {
      return { ok: false, error: "Unknown step ID in selection" }
    }
  }

  // 3. For each step, validate the chosen product is in the server-computed allowed set.
  //    The server — not the client — determines stepNumber, stepType, isReplacement,
  //    and originalProductId from authoritative data.
  const selectionByStep = new Map(selections.map((s) => [s.stepId, s.productId]))

  type ChosenItem = {
    stepId: string
    stepNumber: number
    stepType: StepType
    productId: string
    originalProductId: string | null
    isReplacement: boolean
    instruction: string | null
  }

  const chosenItems: ChosenItem[] = []
  for (const step of preview.steps) {
    const productId = selectionByStep.get(step.stepId)!
    const option = step.options.find((o) => o.id === productId)
    if (!option) {
      return {
        ok: false,
        error: `Product not allowed for step ${step.stepNumber} (${step.stepType})`,
      }
    }
    chosenItems.push({
      stepId: step.stepId,
      stepNumber: step.stepNumber,
      stepType: step.stepType as StepType,
      productId,
      originalProductId: step.defaultProductId,
      isReplacement: option.isReplacement,
      instruction: step.instruction,
    })
  }

  // 4. Transactional write: race-safe token claim + package + audit in one unit.
  try {
    const pkg = await prisma.$transaction(async (tx) => {
      // Race-safe status transition: only claim the token if still AVAILABLE.
      const claim = await tx.qRToken.updateMany({
        where: { id: tokenId, status: "AVAILABLE" },
        data: { status: "ASSIGNED", assignedAt: new Date() },
      })
      if (claim.count === 0) {
        throw new Error("TOKEN_TAKEN")
      }

      const created = await tx.package.create({
        data: {
          qrTokenId: tokenId,
          routineTemplateId: routineId,
          status: "ASSIGNED",
          createdByUserId: user.id,
        },
      })

      await tx.packageProduct.createMany({
        data: chosenItems.map((c) => ({
          packageId: created.id,
          routineTemplateStepId: c.stepId,
          stepNumber: c.stepNumber,
          stepType: c.stepType,
          productId: c.productId,
          originalProductId: c.originalProductId,
          isReplacement: c.isReplacement,
          instruction: c.instruction,
        })),
      })

      await writeAuditLog(
        user.id,
        "ASSIGN",
        "Package",
        created.id,
        { qrTokenId: tokenId, routineTemplateId: routineId },
        tx
      )

      return created
    })

    revalidatePath("/seller")
    revalidatePath("/admin/qr-tokens")
    return { ok: true, packageId: pkg.id }
  } catch (err) {
    if (err instanceof Error && err.message === "TOKEN_TAKEN") {
      return {
        ok: false,
        error: "This token was just taken by someone else. Please use another.",
      }
    }
    throw err
  }
}
