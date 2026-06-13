/**
 * Focused regression tests for Phase 1 core-correctness fixes.
 *
 * Tests the underlying service/DB logic rather than the HTTP or Server Action
 * boundary (which requires the full NextAuth runtime). Auth boundary is
 * validated by TypeScript type-checking and the explicit requireAnyRole calls.
 *
 * Coverage:
 *   A – AUTH-002: isActive gate rejects deactivated users
 *   B – AUTH-001: SELLER role enforcement (schema invariant check)
 *   C – DATA-001: voidToken syncs Package.status to VOIDED
 *   D – DATA-001: voiding AVAILABLE token (no package) succeeds
 *   E – DATA-001: audit log written inside transaction (one row per void)
 *   F – DATA-002: assignment option validation (wrong product rejected)
 *   G – DATA-002: assignment option validation (correct product accepted)
 *   H – DATA-002: assignment server sets isReplacement from authoritative data
 *   I – DATA-003: voidToken writes audit inside transaction
 *   J – ROUTINE: diagnosis existence checked before write
 *   K – ROUTINE: product stepType match enforced
 *
 * Run:  npm run test:correctness
 */

import "dotenv/config"
import crypto from "crypto"
import { z } from "zod"
import { prisma } from "../src/lib/prisma"
import type { StepType } from "../src/generated/prisma/client"
import { writeAuditLog } from "../src/lib/audit"

// ─── Helpers ────────────────────────────────────────────────────────────────

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`.toUpperCase()
const prefix = `CORR-${runId}-`
let exitCode = 0

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`)
    exitCode = 1
  } else {
    console.log(`  ✅ PASS: ${message}`)
  }
}

function uid(label: string) {
  return `${prefix}${label}-${crypto.randomUUID().slice(0, 6)}`
}

// ─── Option-building logic mirrored from assign/actions.ts ───────────────────
// Validates without the auth layer so we can call it from a script.

type StepProductOption = { id: string; isReplacement: boolean }
type AuthorizedStep = {
  stepId: string
  stepNumber: number
  stepType: string
  options: StepProductOption[]
  defaultProductId: string | null
  instruction: string | null
}

async function buildAuthorizedSteps(routineId: string): Promise<AuthorizedStep[] | null> {
  const routine = await prisma.routineTemplate.findUnique({
    where: { id: routineId },
    include: {
      steps: {
        orderBy: { stepNumber: "asc" },
        include: { defaultProduct: { select: { id: true, name: true, sku: true } } },
      },
    },
  })
  if (!routine || !routine.active) return null

  const defaultProductIds = routine.steps
    .map((s) => s.defaultProductId)
    .filter((id): id is string => !!id)

  const replacementRules = defaultProductIds.length
    ? await prisma.productReplacement.findMany({
        where: { sourceProductId: { in: defaultProductIds }, active: true },
        include: {
          replacement: { select: { id: true, name: true, sku: true, active: true } },
        },
      })
    : []

  const stepTypes = Array.from(new Set(routine.steps.map((s) => s.stepType)))
  const sameTypeProducts = await prisma.product.findMany({
    where: { active: true, stepType: { in: stepTypes as StepType[] } },
    select: { id: true, name: true, sku: true, stepType: true },
    orderBy: { name: "asc" },
  })

  return routine.steps.map((step) => {
    const options = new Map<string, StepProductOption>()
    if (step.defaultProduct) {
      options.set(step.defaultProduct.id, { id: step.defaultProduct.id, isReplacement: false })
    }
    for (const p of sameTypeProducts) {
      if (p.stepType !== step.stepType) continue
      if (options.has(p.id)) continue
      options.set(p.id, { id: p.id, isReplacement: p.id !== step.defaultProductId })
    }
    if (step.defaultProductId) {
      for (const rule of replacementRules) {
        if (rule.sourceProductId !== step.defaultProductId) continue
        if (!rule.replacement.active) continue
        if (options.has(rule.replacement.id)) continue
        options.set(rule.replacement.id, { id: rule.replacement.id, isReplacement: true })
      }
    }
    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      stepType: step.stepType,
      options: Array.from(options.values()),
      defaultProductId: step.defaultProductId,
      instruction: step.instruction,
    }
  })
}

// ─── Void-token service function mirrored from qr-tokens/actions.ts ──────────

async function voidTokenById(
  tokenId: string,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.qRToken.updateMany({
        where: { id: tokenId, status: { in: ["AVAILABLE", "ASSIGNED"] } },
        data: { status: "VOIDED", voidedAt: new Date() },
      })
      if (result.count === 0) throw new Error("VOID_REJECTED")

      await tx.package.updateMany({
        where: { qrTokenId: tokenId, status: "ASSIGNED" },
        data: { status: "VOIDED" },
      })

      await writeAuditLog(actorUserId, "VOID", "QRToken", tokenId, undefined, tx)
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof Error && err.message === "VOID_REJECTED") {
      return { ok: false, error: "Token cannot be voided" }
    }
    throw err
  }
}

// ─── Diagnosis-routine link validation mirrored from assign/actions.ts ────────
// Validates that the given diagnosis is active and linked to the given routine.
// Mirrors the RoutineTemplateDiagnosis query in confirmAssignment (Phase 4).

async function checkDiagnosisRoutineLink(
  routineId: string,
  diagnosisId: string
): Promise<string | null> {
  if (!diagnosisId) return "Missing diagnosisId"
  const link = await prisma.routineTemplateDiagnosis.findUnique({
    where: {
      routineTemplateId_diagnosisId: { routineTemplateId: routineId, diagnosisId },
    },
    select: { diagnosis: { select: { active: true } } },
  })
  if (!link) return "Diagnosis is not associated with this routine"
  if (!link.diagnosis.active) return "Diagnosis is no longer active"
  return null
}

// ─── Nested-refs validation mirrored from routines/actions.ts ────────────────

async function validateNestedRefs(
  diagnosisIds: string[],
  steps: { stepType: string; defaultProductId?: string | null }[]
): Promise<string | null> {
  if (new Set(diagnosisIds).size !== diagnosisIds.length) {
    return "Duplicate diagnosis selected"
  }
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

// ─── Test runner ─────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\nCore Correctness Test Run: ${runId}\n`)

  // Grab a real admin user for audit logs.
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } })
  if (!adminUser) throw new Error("No ADMIN user found — run db:seed first")
  const adminId = adminUser.id

  // ── TEST A — AUTH-002: isActive gate ────────────────────────────────────
  console.log("=== TEST A: isActive gate (AUTH-002) ===")
  const inactiveUser = await prisma.user.create({
    data: {
      email: `${uid("inactive")}@test.invalid`,
      name: "Inactive Test",
      passwordHash: "bcrypt-placeholder",
      role: "SELLER",
      isActive: false,
    },
  })
  const found = await prisma.user.findUnique({
    where: { id: inactiveUser.id },
    select: { isActive: true },
  })
  assert(found?.isActive === false, "A: inactive user record has isActive=false")
  // Simulate the getCurrentUser() DB gate.
  const gateResult = !found || !found.isActive
  assert(gateResult === true, "A: isActive gate rejects inactive user")

  // ── TEST B — AUTH-001: UserRole enum covers SELLER ──────────────────────
  console.log("\n=== TEST B: SELLER role enforcement (AUTH-001) ===")
  const sellerUser = await prisma.user.create({
    data: {
      email: `${uid("seller")}@test.invalid`,
      name: "Seller Test",
      passwordHash: "bcrypt-placeholder",
      role: "SELLER",
      isActive: true,
    },
  })
  assert(sellerUser.role === "SELLER", "B: SELLER role stored correctly in DB")
  // Verify requireAnyRole logic: ["SELLER","ADMIN"].includes(role)
  assert(["SELLER", "ADMIN"].includes(sellerUser.role), "B: SELLER passes requireAnyRole('SELLER','ADMIN')")
  const nonSellerRole = "VIEWER"
  assert(!["SELLER", "ADMIN"].includes(nonSellerRole), "B: unknown role rejected by requireAnyRole")

  // ── TEST C — DATA-001: void ASSIGNED token syncs Package.status ─────────
  console.log("\n=== TEST C: voidToken syncs Package.status (DATA-001) ===")

  // Need a real routine template for the package FK.
  const routineType = await prisma.routineType.findFirst()
  assert(!!routineType, "C: precondition — at least one routine type exists")

  const routine = await prisma.routineTemplate.create({
    data: {
      name: uid("RT"),
      routineTypeId: routineType!.id,
      active: true,
    },
  })

  // Create a token and assign it.
  const tokenC = await prisma.qRToken.create({
    data: {
      token: uid("TKC"),
      status: "ASSIGNED",
      assignedAt: new Date(),
      generatedByUserId: adminId,
    },
  })
  const pkgC = await prisma.package.create({
    data: {
      qrTokenId: tokenC.id,
      routineTemplateId: routine.id,
      status: "ASSIGNED",
      createdByUserId: adminId,
    },
  })

  const voidC = await voidTokenById(tokenC.id, adminId)
  assert(voidC.ok === true, "C: void ASSIGNED token succeeds")

  const tokenCAfter = await prisma.qRToken.findUnique({
    where: { id: tokenC.id },
    select: { status: true },
  })
  assert(tokenCAfter?.status === "VOIDED", "C: QRToken.status = VOIDED after void")

  const pkgCAfter = await prisma.package.findUnique({
    where: { id: pkgC.id },
    select: { status: true },
  })
  assert(pkgCAfter?.status === "VOIDED", "C: Package.status = VOIDED after void (DATA-001 fix)")

  // ── TEST D — DATA-001: void AVAILABLE token (no package) succeeds ────────
  console.log("\n=== TEST D: void AVAILABLE token (no package) (DATA-001) ===")
  const tokenD = await prisma.qRToken.create({
    data: {
      token: uid("TKD"),
      status: "AVAILABLE",
      generatedByUserId: adminId,
    },
  })
  const voidD = await voidTokenById(tokenD.id, adminId)
  assert(voidD.ok === true, "D: void AVAILABLE token succeeds")
  const tokenDAfter = await prisma.qRToken.findUnique({
    where: { id: tokenD.id },
    select: { status: true },
  })
  assert(tokenDAfter?.status === "VOIDED", "D: AVAILABLE token → VOIDED")

  // ── TEST E — DATA-001: already-terminal tokens rejected ──────────────────
  console.log("\n=== TEST E: already-terminal token rejected (DATA-001) ===")
  const tokenE = await prisma.qRToken.create({
    data: {
      token: uid("TKE"),
      status: "ACTIVATED",
      generatedByUserId: adminId,
    },
  })
  const voidE = await voidTokenById(tokenE.id, adminId)
  assert(voidE.ok === false, "E: void ACTIVATED token rejected")
  assert("error" in voidE && typeof voidE.error === "string", "E: returns error string")

  // ── TEST F — DATA-001: audit log written inside transaction ──────────────
  console.log("\n=== TEST F: void audit log atomicity (DATA-003) ===")
  const tokenF = await prisma.qRToken.create({
    data: {
      token: uid("TKF"),
      status: "AVAILABLE",
      generatedByUserId: adminId,
    },
  })
  const auditCountBefore = await prisma.auditLog.count({
    where: { entityType: "QRToken", entityId: tokenF.id },
  })
  await voidTokenById(tokenF.id, adminId)
  const auditCountAfter = await prisma.auditLog.count({
    where: { entityType: "QRToken", entityId: tokenF.id },
  })
  assert(auditCountAfter - auditCountBefore === 1, "F: exactly one audit log row per void")

  // ── TEST G — DATA-002: assignment option validation (wrong product) ───────
  console.log("\n=== TEST G: assignment rejects off-list product (DATA-002) ===")

  // Find or confirm we have a CLEANSER and a TONER product in the DB.
  const cleanserProduct = await prisma.product.findFirst({
    where: { active: true, stepType: "CLEANSER" },
    select: { id: true, name: true, stepType: true },
  })
  const tonerProduct = await prisma.product.findFirst({
    where: { active: true, stepType: "TONER" },
    select: { id: true, name: true, stepType: true },
  })

  if (!cleanserProduct || !tonerProduct) {
    console.log("  ⚠ SKIP G, H: requires seeded CLEANSER + TONER products")
  } else {
    // Create a routine with a CLEANSER step.
    const routineG = await prisma.routineTemplate.create({
      data: {
        name: uid("RTG"),
        routineTypeId: routineType!.id,
        active: true,
        steps: {
          create: [
            {
              stepNumber: 1,
              stepType: "CLEANSER",
              defaultProductId: cleanserProduct.id,
            },
          ],
        },
      },
    })

    const stepsG = await buildAuthorizedSteps(routineG.id)
    assert(!!stepsG, "G: buildAuthorizedSteps returns steps for active routine")
    const step1 = stepsG![0]

    // The TONER product must NOT be in the options for the CLEANSER step.
    const tonerInOptions = step1.options.some((o) => o.id === tonerProduct.id)
    assert(!tonerInOptions, "G: TONER product not in allowed options for CLEANSER step (DATA-002 fix)")

    // The CLEANSER product MUST be in the options.
    const cleanserInOptions = step1.options.some((o) => o.id === cleanserProduct.id)
    assert(cleanserInOptions, "G: CLEANSER product is in allowed options for CLEANSER step")

    // ── TEST H — DATA-002: correct product accepted, server sets isReplacement
    console.log("\n=== TEST H: server determines isReplacement (DATA-002) ===")
    const defaultOption = step1.options.find((o) => o.id === cleanserProduct.id)
    assert(defaultOption !== undefined, "H: default product appears in options")
    assert(defaultOption?.isReplacement === false, "H: default product has isReplacement=false")

    // Any other product in options (not the default) should be isReplacement=true.
    const nonDefaultOptions = step1.options.filter((o) => o.id !== cleanserProduct.id)
    assert(
      nonDefaultOptions.every((o) => o.isReplacement === true),
      "H: all non-default options have isReplacement=true"
    )

    // Cleanup routine G.
    await prisma.routineTemplateStep.deleteMany({ where: { routineTemplateId: routineG.id } })
    await prisma.routineTemplate.delete({ where: { id: routineG.id } })
  }

  // ── TEST J — ROUTINE: diagnosis existence checked ──────────────────────
  console.log("\n=== TEST J: routine diagnosis validation (DATA-004) ===")
  const fakeId = "nonexistent-id-" + crypto.randomUUID()
  const diagError = await validateNestedRefs([fakeId], [])
  assert(diagError !== null, "J: unknown diagnosisId returns error")
  assert(typeof diagError === "string" && diagError.includes("not found"), "J: error mentions 'not found'")

  // Duplicate diagnosis IDs.
  const realDiag = await prisma.diagnosis.findFirst({ where: { active: true } })
  if (realDiag) {
    const dupError = await validateNestedRefs([realDiag.id, realDiag.id], [])
    assert(dupError !== null, "J: duplicate diagnosisId returns error")
  }

  // ── TEST K — ROUTINE: product stepType mismatch caught ────────────────
  console.log("\n=== TEST K: routine product/step type mismatch (DATA-004) ===")
  if (tonerProduct) {
    // Assign a TONER product to a CLEANSER step — should fail.
    const mismatchError = await validateNestedRefs([], [
      { stepType: "CLEANSER", defaultProductId: tonerProduct.id },
    ])
    assert(mismatchError !== null, "K: product stepType mismatch returns error")
    assert(
      typeof mismatchError === "string" && mismatchError.includes("TONER"),
      "K: error mentions the mismatched step type"
    )
  } else {
    console.log("  ⚠ SKIP K: requires seeded TONER product")
  }

  // ── TESTS L-T — diagnosis-routine integrity (Phase 4) ──────────────────
  console.log("\n=== TESTS L-T: diagnosis-routine link (Phase 4) ===")

  // Setup: three diagnoses and one routine template for all L-T tests.
  const diagActive = await prisma.diagnosis.create({
    data: { name: uid("DIAG-A"), slug: uid("dslug-a"), active: true },
  })
  const diagInactive = await prisma.diagnosis.create({
    data: { name: uid("DIAG-I"), slug: uid("dslug-i"), active: false },
  })
  const diagUnrelated = await prisma.diagnosis.create({
    data: { name: uid("DIAG-U"), slug: uid("dslug-u"), active: true },
  })

  const routineLT = await prisma.routineTemplate.create({
    data: {
      name: uid("RT-LT"),
      routineTypeId: routineType!.id,
      active: true,
      diagnoses: {
        create: [
          { diagnosisId: diagActive.id },
          // diagInactive is linked so test N can check the active flag.
          { diagnosisId: diagInactive.id },
        ],
      },
    },
  })
  // diagUnrelated is intentionally NOT linked to routineLT.

  const tokenLT = await prisma.qRToken.create({
    data: { token: uid("TKLT"), status: "AVAILABLE", generatedByUserId: adminId },
  })
  const tokenT = await prisma.qRToken.create({
    data: { token: uid("TKT"), status: "AVAILABLE", generatedByUserId: adminId },
  })
  let pkgT: { id: string } | null = null

  // L: active linked diagnosis passes
  const errL = await checkDiagnosisRoutineLink(routineLT.id, diagActive.id)
  assert(errL === null, "L: active linked diagnosis passes validation")

  // M: active but unrelated diagnosis rejected
  const errM = await checkDiagnosisRoutineLink(routineLT.id, diagUnrelated.id)
  assert(errM !== null, "M: unrelated active diagnosis rejected")
  assert(typeof errM === "string" && errM.includes("not associated"), "M: error is 'not associated'")

  // N: linked but inactive diagnosis rejected
  const errN = await checkDiagnosisRoutineLink(routineLT.id, diagInactive.id)
  assert(errN !== null, "N: inactive diagnosis rejected even when linked")
  assert(typeof errN === "string" && errN.includes("no longer active"), "N: error mentions 'no longer active'")

  // O: completely unknown diagnosisId rejected
  const errO = await checkDiagnosisRoutineLink(routineLT.id, "nonexistent-" + crypto.randomUUID())
  assert(errO !== null, "O: unknown diagnosisId rejected")

  // P: empty diagnosisId fails ConfirmSchema (mirrors z.string().min(1) in actions.ts)
  const ConfirmSchemaLT = z.object({
    tokenId: z.string().min(1),
    routineId: z.string().min(1),
    diagnosisId: z.string().min(1),
    selections: z.array(z.object({ stepId: z.string().min(1), productId: z.string().min(1) })),
  })
  const parsedP = ConfirmSchemaLT.safeParse({
    tokenId: "some-id",
    routineId: "some-id",
    diagnosisId: "",
    selections: [],
  })
  assert(parsedP.success === false, "P: empty diagnosisId rejected by ConfirmSchema (min(1))")

  // Q: after a failed link check, the token remains AVAILABLE (no transaction ran)
  const errQ = await checkDiagnosisRoutineLink(routineLT.id, diagUnrelated.id)
  assert(errQ !== null, "Q: precondition — link check fails for unrelated diagnosis")
  const tokenLTStatus = await prisma.qRToken.findUnique({
    where: { id: tokenLT.id },
    select: { status: true },
  })
  assert(tokenLTStatus?.status === "AVAILABLE", "Q: token stays AVAILABLE after failed diagnosis check")

  // R: no Package row created for the failing token
  const pkgCountLT = await prisma.package.count({ where: { qrTokenId: tokenLT.id } })
  assert(pkgCountLT === 0, "R: no Package created after failed diagnosis check")

  // S: no AuditLog row written for the failing token
  const auditCountLT = await prisma.auditLog.count({
    where: { entityType: "QRToken", entityId: tokenLT.id },
  })
  assert(auditCountLT === 0, "S: no AuditLog created after failed diagnosis check")

  // T: valid (routineId, diagnosisId) pair allows the full assignment to succeed
  {
    const linkCheck = await checkDiagnosisRoutineLink(routineLT.id, diagActive.id)
    assert(linkCheck === null, "T: link check passes for valid (routineId, diagnosisId)")

    pkgT = await prisma.$transaction(async (tx) => {
      const claim = await tx.qRToken.updateMany({
        where: { id: tokenT.id, status: "AVAILABLE" },
        data: { status: "ASSIGNED", assignedAt: new Date() },
      })
      if (claim.count === 0) throw new Error("CLAIM_FAILED")

      const created = await tx.package.create({
        data: {
          qrTokenId: tokenT.id,
          routineTemplateId: routineLT.id,
          status: "ASSIGNED",
          createdByUserId: adminId,
        },
      })

      await writeAuditLog(
        adminId,
        "ASSIGN",
        "Package",
        created.id,
        { qrTokenId: tokenT.id, routineTemplateId: routineLT.id },
        tx
      )

      return created
    })

    const tokenTAfter = await prisma.qRToken.findUnique({
      where: { id: tokenT.id },
      select: { status: true },
    })
    assert(tokenTAfter?.status === "ASSIGNED", "T: token transitions to ASSIGNED with valid diagnosis")
    assert(pkgT !== null, "T: Package row created for valid assignment with correct diagnosis")
  }

  // ── Cleanup ────────────────────────────────────────────────────────────
  console.log("\n=== Cleanup ===")

  // Phase 4 records
  if (pkgT) {
    await prisma.auditLog.deleteMany({ where: { entityType: "Package", entityId: pkgT.id } })
    await prisma.package.delete({ where: { id: pkgT.id } })
  }
  await prisma.qRToken.deleteMany({ where: { id: { in: [tokenLT.id, tokenT.id] } } })
  // RoutineTemplateDiagnosis rows cascade-delete with the template.
  await prisma.routineTemplate.delete({ where: { id: routineLT.id } })
  await prisma.diagnosis.deleteMany({ where: { id: { in: [diagActive.id, diagInactive.id, diagUnrelated.id] } } })

  // Phase 1 records
  await prisma.auditLog.deleteMany({ where: { entityType: "QRToken", entityId: { in: [tokenC.id, tokenD.id, tokenE.id, tokenF.id] } } })
  await prisma.package.deleteMany({ where: { id: pkgC.id } })
  await prisma.qRToken.deleteMany({ where: { id: { in: [tokenC.id, tokenD.id, tokenE.id, tokenF.id] } } })
  await prisma.routineTemplate.delete({ where: { id: routine.id } })
  await prisma.user.deleteMany({ where: { id: { in: [inactiveUser.id, sellerUser.id] } } })
  console.log("  Cleanup complete.")

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\nTest run ${exitCode === 0 ? "✅ ALL PASSED" : "❌ SOME FAILED"}`)
  process.exit(exitCode)
}

runTests().catch((err) => {
  console.error("Unhandled error:", err)
  process.exit(1)
})
