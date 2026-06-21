/**
 * Regression tests for replacement-rule correctness.
 *
 * Tests the DB layer and server-action logic without the NextAuth boundary.
 * The auth gate (requireRole) is enforced by type-checking and explicit calls
 * in production; these tests validate the invariant logic beneath it.
 *
 * Coverage:
 *   A – addReplacementRule rejects self-replacement
 *   B – addReplacementRule rejects cross-stepType (CLEANSER ↔ TONER)
 *   C – addReplacementRule rejects when rule stepType mismatch: source is CLEANSER but replacement is TONER
 *   D – addReplacementRule accepts same stepType pair
 *   E – addReplacementRule rejects duplicate rule
 *   F – addReplacementRule derives stepType from source (not form data)
 *   G – candidate products exclude source and already-configured replacements
 *   H – candidate products only show same stepType as source
 *   I – updateProduct blocked when source rules exist (stepType change)
 *   J – updateProduct blocked when is-target rules exist (stepType change)
 *   K – updateProduct allows stepType change when no rules
 *   L – seller confirmAssignment rejects product not in allowed option set
 *   M – audit: valid replacement record (same stepType) passes
 *   N – audit: invalid replacement record (stepType mismatch) detected
 *
 * Run:  npx tsx scripts/test-replacement-rules.ts
 */

import "dotenv/config"
import crypto from "crypto"
import { prisma } from "../src/lib/prisma"
import type { StepType } from "../src/generated/prisma/client"

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`.toUpperCase()
const prefix = `REPL-${runId}-`
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

// ─── Core logic mirrored from replacement-actions.ts ────────────────────────
// Validates the invariant without the auth layer.

async function tryAddReplacement(
  sourceId: string,
  replacementId: string
): Promise<{ ok: true; ruleId: string } | { ok: false; error: string }> {
  if (replacementId === sourceId) return { ok: false, error: "self" }

  const [source, replacement] = await Promise.all([
    prisma.product.findUnique({
      where: { id: sourceId },
      select: { id: true, stepType: true },
    }),
    prisma.product.findUnique({
      where: { id: replacementId },
      select: { id: true, name: true, stepType: true },
    }),
  ])

  if (!source) return { ok: false, error: "source not found" }
  if (!replacement) return { ok: false, error: "replacement not found" }
  if (replacement.stepType !== source.stepType) {
    return { ok: false, error: `stepType mismatch: ${source.stepType} vs ${replacement.stepType}` }
  }

  const existing = await prisma.productReplacement.findUnique({
    where: {
      sourceProductId_replacementProductId: {
        sourceProductId: sourceId,
        replacementProductId: replacementId,
      },
    },
    select: { id: true },
  })
  if (existing) return { ok: false, error: "duplicate" }

  const rule = await prisma.productReplacement.create({
    data: {
      sourceProductId: sourceId,
      replacementProductId: replacementId,
      stepType: source.stepType,
    },
  })
  return { ok: true, ruleId: rule.id }
}

async function blockingRuleCount(productId: string): Promise<number> {
  return prisma.productReplacement.count({
    where: {
      OR: [{ sourceProductId: productId }, { replacementProductId: productId }],
    },
  })
}

// ─── Test data helpers ───────────────────────────────────────────────────────

async function createProduct(stepType: StepType, suffix = "") {
  return prisma.product.create({
    data: {
      name: uid(`PROD-${stepType}${suffix}`),
      stepType,
      active: true,
    },
  })
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

const ruleIds: string[] = []
const productIds: string[] = []

async function cleanup() {
  if (ruleIds.length > 0) {
    await prisma.productReplacement.deleteMany({
      where: { id: { in: ruleIds } },
    })
  }
  if (productIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nReplacement-rule tests  run=${runId}\n`)

  // Create test products
  const cleanserA = await createProduct("CLEANSER", "-A")
  const cleanserB = await createProduct("CLEANSER", "-B")
  const cleanserC = await createProduct("CLEANSER", "-C")
  const tonerA = await createProduct("TONER", "-A")
  productIds.push(cleanserA.id, cleanserB.id, cleanserC.id, tonerA.id)

  // ── A: self-replacement rejected ──────────────────────────────────────────
  console.log("A — self-replacement rejected")
  {
    const res = await tryAddReplacement(cleanserA.id, cleanserA.id)
    assert(!res.ok && res.error === "self", "self-replacement returns error")
  }

  // ── B: cross-stepType rejected ────────────────────────────────────────────
  console.log("B — cross-stepType rejected")
  {
    const res = await tryAddReplacement(cleanserA.id, tonerA.id)
    assert(
      !res.ok && res.error.includes("stepType mismatch"),
      "CLEANSER → TONER returns stepType mismatch"
    )
  }

  // ── C: same pair reversed is also rejected ────────────────────────────────
  console.log("C — reverse cross-stepType rejected")
  {
    const res = await tryAddReplacement(tonerA.id, cleanserA.id)
    assert(
      !res.ok && res.error.includes("stepType mismatch"),
      "TONER → CLEANSER returns stepType mismatch"
    )
  }

  // ── D: same stepType accepted ─────────────────────────────────────────────
  console.log("D — same stepType accepted")
  {
    const res = await tryAddReplacement(cleanserA.id, cleanserB.id)
    assert(res.ok, "CLEANSER → CLEANSER succeeds")
    if (res.ok) ruleIds.push(res.ruleId)
  }

  // ── E: duplicate rule rejected ────────────────────────────────────────────
  console.log("E — duplicate rule rejected")
  {
    const res = await tryAddReplacement(cleanserA.id, cleanserB.id)
    assert(!res.ok && res.error === "duplicate", "duplicate rule returns error")
  }

  // ── F: stepType derived from source (persisted on the rule) ───────────────
  console.log("F — rule stepType matches source product stepType")
  {
    const rule = await prisma.productReplacement.findFirst({
      where: { sourceProductId: cleanserA.id, replacementProductId: cleanserB.id },
      select: { stepType: true },
    })
    assert(
      rule?.stepType === "CLEANSER",
      `rule.stepType=CLEANSER (got ${rule?.stepType})`
    )
  }

  // ── G: candidates exclude source and already-configured ───────────────────
  console.log("G — candidates exclude source and already-configured replacements")
  {
    const alreadyConfiguredIds = (
      await prisma.productReplacement.findMany({
        where: { sourceProductId: cleanserA.id },
        select: { replacementProductId: true },
      })
    ).map((r) => r.replacementProductId)

    const candidates = await prisma.product.findMany({
      where: {
        active: true,
        stepType: cleanserA.stepType,
        id: { notIn: [cleanserA.id, ...alreadyConfiguredIds] },
      },
      select: { id: true },
    })

    const candidateIds = candidates.map((c) => c.id)
    assert(!candidateIds.includes(cleanserA.id), "source excluded from candidates")
    assert(!candidateIds.includes(cleanserB.id), "already-configured excluded")
    assert(candidateIds.includes(cleanserC.id), "unconfigured same-type included")
    assert(!candidateIds.includes(tonerA.id), "different stepType excluded")
  }

  // ── H: candidates only show same stepType ─────────────────────────────────
  console.log("H — candidates only show same stepType as source")
  {
    const candidates = await prisma.product.findMany({
      where: {
        active: true,
        stepType: cleanserA.stepType,
        id: { not: cleanserA.id },
      },
      select: { id: true, stepType: true },
    })
    const wrongType = candidates.filter((c) => c.stepType !== cleanserA.stepType)
    assert(wrongType.length === 0, "all candidates share source stepType")
  }

  // ── I: updateProduct blocked when source rules exist ──────────────────────
  console.log("I — updateProduct blocked when source rules exist")
  {
    const count = await blockingRuleCount(cleanserA.id)
    assert(count > 0, "rule count > 0 for cleanserA (which is a source)")
    // This count is what updateProduct checks before allowing stepType change.
  }

  // ── J: updateProduct blocked when product is a target ────────────────────
  console.log("J — updateProduct blocked when product is a target (replacementProductId)")
  {
    const count = await blockingRuleCount(cleanserB.id)
    assert(count > 0, "rule count > 0 for cleanserB (which is a target)")
  }

  // ── K: updateProduct allows stepType change with no rules ─────────────────
  console.log("K — updateProduct allows stepType change when no rules")
  {
    const isolated = await createProduct("SERUM")
    productIds.push(isolated.id)
    const count = await blockingRuleCount(isolated.id)
    assert(count === 0, "isolated product has 0 blocking rules")
  }

  // ── L: seller preview generation limits options to explicitly configured ──
  console.log("L — seller preview generator strictly enforces replacement rules and default product requirements")
  {
    type MockPreviewResult =
      | { ok: true; preview: { steps: { stepId: string, options: { id: string, isReplacement: boolean }[] }[] } }
      | { ok: false; error: string };

    async function mockLoadRoutinePreviewData(routineId: string): Promise<MockPreviewResult | null> {
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

      const steps: { stepId: string, options: { id: string, isReplacement: boolean }[] }[] = []
      for (const step of routine.steps) {
        if (!step.defaultProductId || !step.defaultProduct) {
          return { ok: false, error: "missing default product" }
        }
        if (!step.defaultProduct.active) {
          return { ok: false, error: "inactive default product" }
        }

        const options = new Map<string, { id: string, isReplacement: boolean }>()
        options.set(step.defaultProduct.id, {
          id: step.defaultProduct.id,
          isReplacement: false,
        })

        for (const rule of replacementRules) {
          if (rule.sourceProductId !== step.defaultProductId) continue
          if (!rule.replacement.active) continue
          if (rule.replacement.stepType !== step.defaultProduct.stepType) continue
          if (rule.stepType !== step.defaultProduct.stepType) continue
          options.set(rule.replacement.id, {
            id: rule.replacement.id,
            isReplacement: true,
          })
        }
        steps.push({ stepId: step.id, options: Array.from(options.values()) })
      }
      return { ok: true, preview: { steps } }
    }

    // Create a routine to test assignments
    const rtType = await prisma.routineType.create({
      data: { name: uid("RTTYPE"), slug: uid("RTTYPE").toLowerCase() }
    })
    const routine = await prisma.routineTemplate.create({
      data: {
        name: uid("ROUTINE"),
        active: true,
        routineTypeId: rtType.id
      },
    })

    const cleanserL = await createProduct("CLEANSER", "-L")
    productIds.push(cleanserL.id)

    const step1 = await prisma.routineTemplateStep.create({
      data: {
        routineTemplateId: routine.id,
        stepNumber: 1,
        stepType: "CLEANSER",
        defaultProductId: cleanserL.id,
      },
    })

    // Test: Normal default product works, no other same-step-type products are included
    const preview1 = await mockLoadRoutinePreviewData(routine.id)
    assert(preview1?.ok === true, "normal default product works")
    if (preview1 && preview1.ok) {
      const stepOptions = preview1.preview.steps[0].options
      assert(stepOptions.length === 1, "only default product included by default")
      assert(stepOptions[0].id === cleanserL.id, "default product is correct")
    }

    // Test: Missing default product blocks assignment
    const step2 = await prisma.routineTemplateStep.create({
      data: {
        routineTemplateId: routine.id,
        stepNumber: 2,
        stepType: "TONER",
      },
    })
    const preview2 = await mockLoadRoutinePreviewData(routine.id)
    assert(preview2?.ok === false && preview2.error === "missing default product", "missing default product blocks assignment")

    await prisma.routineTemplateStep.delete({ where: { id: step2.id } })

    // Test: Inactive default product blocks assignment
    await prisma.product.update({ where: { id: cleanserL.id }, data: { active: false } })
    const preview3 = await mockLoadRoutinePreviewData(routine.id)
    assert(preview3?.ok === false && preview3.error === "inactive default product", "inactive default product blocks assignment")
    await prisma.product.update({ where: { id: cleanserL.id }, data: { active: true } })

    // Test: Explicit same-step-type replacement is selectable
    // Create rule: cleanserL -> cleanserB
    const rule1 = await tryAddReplacement(cleanserL.id, cleanserB.id)
    if (rule1.ok) ruleIds.push(rule1.ruleId)
    const preview4 = await mockLoadRoutinePreviewData(routine.id)
    if (preview4 && preview4.ok) {
      const stepOptions = preview4.preview.steps[0].options
      assert(stepOptions.length === 2, "explicit replacement is included")
      assert(stepOptions.some((o: { id: string }) => o.id === cleanserB.id), "cleanserB is an option")
    }

    // Test: Inactive replacement product is not selectable
    await prisma.product.update({ where: { id: cleanserB.id }, data: { active: false } })
    const preview5 = await mockLoadRoutinePreviewData(routine.id)
    if (preview5 && preview5.ok) {
      const stepOptions = preview5.preview.steps[0].options
      assert(stepOptions.length === 1, "inactive replacement is excluded")
      assert(!stepOptions.some((o: { id: string }) => o.id === cleanserB.id), "cleanserB is not an option")
    }
    await prisma.product.update({ where: { id: cleanserB.id }, data: { active: true } })

    // Test: Client-submitted arbitrary product ID is rejected at confirmation
    // We simulate `confirmAssignment` checking `preview.steps[...].options`.
    // TonerA is NOT an option for the cleanser step.
    const preview6 = await mockLoadRoutinePreviewData(routine.id)
    if (preview6 && preview6.ok) {
      const stepOptions = preview6.preview.steps[0].options
      const isAllowed = stepOptions.some((o: { id: string }) => o.id === tonerA.id)
      assert(!isAllowed, "cross-step-type arbitrary product is rejected at confirmation")
    }

    // Cleanup
    await prisma.routineTemplateStep.delete({ where: { id: step1.id } })
    await prisma.routineTemplate.delete({ where: { id: routine.id } })
    await prisma.routineType.delete({ where: { id: rtType.id } })
  }

  // ── M: audit detects valid rule ───────────────────────────────────────────
  console.log("M — audit: valid replacement record passes")
  {
    const rule = await prisma.productReplacement.findFirst({
      where: { sourceProductId: cleanserA.id, replacementProductId: cleanserB.id },
      include: {
        source: { select: { stepType: true } },
        replacement: { select: { stepType: true } },
      },
    })
    assert(!!rule, "rule found")
    if (rule) {
      assert(
        rule.stepType === rule.source.stepType &&
          rule.stepType === rule.replacement.stepType,
        "rule.stepType matches both source and replacement stepTypes"
      )
    }
  }

  // ── N: audit detects invalid rule (manually created via raw DB) ───────────
  console.log("N — audit: invalid replacement record (mismatched stepType) detected")
  {
    // Force-create an invalid rule (skipping server-action validation) to verify
    // the audit script logic catches it.
    const invalidRule = await prisma.productReplacement.create({
      data: {
        sourceProductId: cleanserA.id,
        replacementProductId: tonerA.id,
        // Deliberate mismatch — stepType does not equal replacement.stepType
        stepType: "CLEANSER",
      },
    })
    ruleIds.push(invalidRule.id)

    const loaded = await prisma.productReplacement.findUnique({
      where: { id: invalidRule.id },
      include: {
        source: { select: { stepType: true } },
        replacement: { select: { stepType: true } },
      },
    })
    assert(!!loaded, "invalid rule exists in DB")
    if (loaded) {
      const isInvalid =
        loaded.stepType !== loaded.source.stepType ||
        loaded.stepType !== loaded.replacement.stepType
      assert(isInvalid, "audit logic correctly identifies this rule as invalid")
    }
  }

  console.log("\n─────────────────────────────────")
  if (exitCode === 0) {
    console.log("All replacement-rule tests passed ✅")
  } else {
    console.log("Some tests FAILED ❌")
  }
}

main()
  .catch((err) => {
    console.error(err)
    exitCode = 1
  })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
    process.exit(exitCode)
  })
