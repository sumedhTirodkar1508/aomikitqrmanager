/**
 * Regression tests for the page-specific Excel importers.
 *
 * Pure coverage (no DB): template generation, header/sheet validation, enum and
 * boolean validation, duplicate-identifier detection, existing-record skip,
 * cross-sheet reference + relationship validation for routines, and the
 * accounting invariant totalRows = create + skip + invalid.
 *
 * DB coverage (when DATABASE_URL is set): dry-run performs no writes, commit
 * creates rows + exactly one audit entry, re-commit skips existing, and the
 * transaction is atomic (rollback leaves no partial data).
 *
 * Run:  npm run test:excel-import
 */

import "dotenv/config"
import crypto from "crypto"
import ExcelJS from "exceljs"
import {
  parseProducts,
  buildProductsPreview,
  PRODUCTS_COLUMNS,
} from "../src/lib/server/excel/products"
import {
  parseSlugSheet,
  buildSlugPreview,
} from "../src/lib/server/excel/slug-entity"
import {
  parseRoutines,
  buildRoutinesPreview,
  type RoutineLookups,
} from "../src/lib/server/excel/routines"
import {
  buildProductsTemplate,
  buildDiagnosesTemplate,
  buildRoutineTypesTemplate,
} from "../src/lib/server/excel/templates"
import type { StepType } from "../src/generated/prisma/client"

let exitCode = 0
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`)
    exitCode = 1
  } else {
    console.log(`  ✅ PASS: ${message}`)
  }
}

type SheetDef = { name: string; headers: string[]; rows: (string | number)[][] }

function makeWorkbook(sheets: SheetDef[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name)
    ws.addRow(s.headers)
    for (const r of s.rows) ws.addRow(r)
  }
  return wb
}

async function loadBuffer(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  type LoadBuffer = Parameters<typeof wb.xlsx.load>[0]
  await wb.xlsx.load(buf as unknown as LoadBuffer)
  return wb
}

const PRODUCT_HEADERS = [...PRODUCTS_COLUMNS]
const SLUG_HEADERS = ["slug", "name", "description", "isActive"]

async function main() {
  // ─── Products ───────────────────────────────────────────────────────────────
  console.log("\n── Products importer ──")

  {
    const wb = makeWorkbook([
      {
        name: "Products",
        headers: PRODUCT_HEADERS,
        rows: [
          ["SKU-1", "Cleanser", "CLEANSER", "Face", "desc", "TRUE"],
          ["SKU-2", "Toner", "TONER", "Face", "", "FALSE"],
        ],
      },
    ])
    const parsed = parseProducts(wb)
    assert(parsed.candidates.length === 2 && parsed.errors.length === 0, "valid file → 2 candidates, no errors")
    const preview = buildProductsPreview(parsed, new Set())
    assert(preview.toCreate === 2 && preview.toSkip === 0 && preview.invalid === 0, "valid preview → create 2")
    assert(
      preview.totalRows === preview.toCreate + preview.toSkip + preview.invalid,
      "accounting invariant holds (products)"
    )

    const previewWithExisting = buildProductsPreview(parsed, new Set(["SKU-1"]))
    assert(
      previewWithExisting.toSkip === 1 && previewWithExisting.toCreate === 1,
      "existing SKU → SKIP_EXISTING"
    )
  }

  {
    const wb = makeWorkbook([{ name: "Wrong", headers: PRODUCT_HEADERS, rows: [] }])
    const parsed = parseProducts(wb)
    assert(
      parsed.errors.some((e) => e.message.includes("missing")),
      "missing required sheet → error"
    )
  }

  {
    const wb = makeWorkbook([
      { name: "Products", headers: ["sku", "name", "category", "functionDescription", "isActive"], rows: [] },
    ])
    const parsed = parseProducts(wb)
    assert(
      parsed.errors.some((e) => e.field === "stepType" && e.message.includes("missing")),
      "missing required column → error"
    )
  }

  {
    const wb = makeWorkbook([
      { name: "Products", headers: PRODUCT_HEADERS, rows: [["SKU-1", "X", "NOTATYPE", "", "", "TRUE"]] },
    ])
    const parsed = parseProducts(wb)
    assert(
      parsed.errors.some((e) => e.field === "stepType"),
      "invalid stepType enum → error"
    )
  }

  {
    const wb = makeWorkbook([
      { name: "Products", headers: PRODUCT_HEADERS, rows: [["SKU-1", "X", "CLEANSER", "", "", "maybe"]] },
    ])
    const parsed = parseProducts(wb)
    assert(parsed.errors.some((e) => e.field === "isActive"), "invalid boolean → error")
  }

  {
    const wb = makeWorkbook([
      {
        name: "Products",
        headers: PRODUCT_HEADERS,
        rows: [
          ["DUP", "A", "CLEANSER", "", "", "TRUE"],
          ["DUP", "B", "TONER", "", "", "TRUE"],
        ],
      },
    ])
    const parsed = parseProducts(wb)
    assert(
      parsed.invalidRows.size === 2 && parsed.candidates.length === 0,
      "duplicate SKU within file → both rows invalid"
    )
  }

  {
    // Formula rejection.
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Products")
    ws.addRow(PRODUCT_HEADERS)
    const row = ws.addRow(["SKU-F", "X", "CLEANSER", "", "", "TRUE"])
    row.getCell(2).value = { formula: "1+1", result: "2" } as ExcelJS.CellValue
    const parsed = parseProducts(wb)
    assert(
      parsed.errors.some((e) => e.message.toLowerCase().includes("formula")),
      "formula cell → rejected"
    )
  }

  // ─── Slug entities (diagnoses / routine types) ───────────────────────────────
  console.log("\n── Slug entity importer (diagnoses/routine types) ──")

  {
    const wb = makeWorkbook([
      {
        name: "Diagnoses",
        headers: SLUG_HEADERS,
        rows: [
          ["Acne Mild", "Acne (Mild)", "desc", "TRUE"],
          ["rosacea", "Rosacea", "", "FALSE"],
        ],
      },
    ])
    const parsed = parseSlugSheet(wb, "Diagnoses")
    assert(parsed.candidates.length === 2, "valid slug sheet → 2 candidates")
    assert(parsed.candidates[0].slug === "acne-mild", "slug normalized to lowercase-hyphen")
    const preview = buildSlugPreview("diagnoses", parsed, new Set(["rosacea"]))
    assert(preview.toSkip === 1 && preview.toCreate === 1, "existing slug → SKIP_EXISTING")
    assert(
      preview.totalRows === preview.toCreate + preview.toSkip + preview.invalid,
      "accounting invariant holds (slug entity)"
    )
  }

  {
    const wb = makeWorkbook([
      {
        name: "Diagnoses",
        headers: SLUG_HEADERS,
        rows: [
          ["same", "A", "", "TRUE"],
          ["SAME", "B", "", "TRUE"],
        ],
      },
    ])
    const parsed = parseSlugSheet(wb, "Diagnoses")
    assert(parsed.invalidRows.size === 2, "duplicate normalized slug → both invalid")
  }

  // ─── Routines (multi-sheet, relationships) ───────────────────────────────────
  console.log("\n── Routines importer ──")

  const lookups: RoutineLookups = {
    routineTypeIdBySlug: new Map([["morning", "rt-morning"]]),
    diagnosisIdBySlug: new Map([["acne", "d-acne"]]),
    productBySku: new Map([
      ["CLN-1", { id: "p-cln", stepType: "CLEANSER" as StepType }],
      ["TON-1", { id: "p-ton", stepType: "TONER" as StepType }],
    ]),
  }

  function routinesWorkbook(opts: {
    routines: (string | number)[][]
    diagnoses: (string | number)[][]
    steps: (string | number)[][]
  }) {
    return makeWorkbook([
      {
        name: "Routines",
        headers: [
          "routineKey",
          "name",
          "routineTypeSlug",
          "durationDays",
          "description",
          "generalInstructions",
          "isActive",
        ],
        rows: opts.routines,
      },
      { name: "Routine Diagnoses", headers: ["routineKey", "diagnosisSlug"], rows: opts.diagnoses },
      {
        name: "Routine Steps",
        headers: ["routineKey", "stepNumber", "stepType", "defaultProductSku", "instruction"],
        rows: opts.steps,
      },
    ])
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "Morning Routine", "morning", "30", "", "", "TRUE"]],
      diagnoses: [["R1", "acne"]],
      steps: [
        ["R1", "1", "CLEANSER", "CLN-1", "Apply"],
        ["R1", "2", "TONER", "TON-1", ""],
      ],
    })
    const parsed = parseRoutines(wb, lookups)
    assert(parsed.candidates.length === 1 && parsed.errors.length === 0, "valid routine → 1 candidate")
    assert(parsed.candidates[0].steps.length === 2, "routine has 2 steps")
    assert(parsed.candidates[0].diagnosisIds.length === 1, "routine has 1 diagnosis")
    const preview = buildRoutinesPreview(parsed, new Set())
    assert(preview.toCreate === 1, "routine preview → create 1")
    const skipPreview = buildRoutinesPreview(parsed, new Set(["morning routine"]))
    assert(skipPreview.toSkip === 1, "existing routine name → SKIP_EXISTING")
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "X", "unknown-type", "", "", "", "TRUE"]],
      diagnoses: [],
      steps: [["R1", "1", "CLEANSER", "CLN-1", ""]],
    })
    const parsed = parseRoutines(wb, lookups)
    assert(
      parsed.errors.some((e) => e.field === "routineTypeSlug"),
      "unknown routine type → error"
    )
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "X", "morning", "", "", "", "TRUE"]],
      diagnoses: [["R1", "nope"]],
      steps: [["R1", "1", "CLEANSER", "CLN-1", ""]],
    })
    const parsed = parseRoutines(wb, lookups)
    assert(parsed.errors.some((e) => e.field === "diagnosisSlug"), "unknown diagnosis → error")
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "X", "morning", "", "", "", "TRUE"]],
      diagnoses: [["R1", "acne"]],
      steps: [["R1", "1", "CLEANSER", "MISSING", ""]],
    })
    const parsed = parseRoutines(wb, lookups)
    assert(parsed.errors.some((e) => e.field === "defaultProductSku"), "unknown product → error")
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "X", "morning", "", "", "", "TRUE"]],
      diagnoses: [["R1", "acne"]],
      steps: [["R1", "1", "TONER", "CLN-1", ""]], // CLN-1 is CLEANSER
    })
    const parsed = parseRoutines(wb, lookups)
    assert(
      parsed.errors.some((e) => e.message.includes("CLEANSER") || e.message.includes("TONER")),
      "product/step-type mismatch → error"
    )
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "X", "morning", "", "", "", "TRUE"]],
      diagnoses: [
        ["R1", "acne"],
        ["R1", "acne"],
      ],
      steps: [["R1", "1", "CLEANSER", "CLN-1", ""]],
    })
    const parsed = parseRoutines(wb, lookups)
    assert(
      parsed.errors.some((e) => e.message.includes("Duplicate routine/diagnosis")),
      "duplicate routine/diagnosis pair → error"
    )
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "X", "morning", "", "", "", "TRUE"]],
      diagnoses: [["R1", "acne"]],
      steps: [
        ["R1", "1", "CLEANSER", "CLN-1", ""],
        ["R1", "1", "TONER", "TON-1", ""],
      ],
    })
    const parsed = parseRoutines(wb, lookups)
    assert(
      parsed.errors.some((e) => e.message.includes("Duplicate step number")),
      "duplicate step number → error"
    )
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "X", "morning", "", "", "", "TRUE"]],
      diagnoses: [["R1", "acne"]],
      steps: [], // no steps
    })
    const parsed = parseRoutines(wb, lookups)
    assert(parsed.errors.some((e) => e.message.includes("no steps")), "routine with no steps → error")
  }

  {
    const wb = routinesWorkbook({
      routines: [["R1", "X", "morning", "", "", "", "TRUE"]],
      diagnoses: [["GHOST", "acne"]],
      steps: [["R1", "1", "CLEANSER", "CLN-1", ""]],
    })
    const parsed = parseRoutines(wb, lookups)
    assert(
      parsed.errors.some((e) => e.message.includes("does not exist")),
      "dangling routineKey reference → error"
    )
  }

  {
    const wb = routinesWorkbook({
      routines: [
        ["R1", "A", "morning", "", "", "", "TRUE"],
        ["R1", "B", "morning", "", "", "", "TRUE"],
      ],
      diagnoses: [["R1", "acne"]],
      steps: [["R1", "1", "CLEANSER", "CLN-1", ""]],
    })
    const parsed = parseRoutines(wb, lookups)
    assert(
      parsed.errors.some((e) => e.message.includes("Duplicate routineKey")),
      "duplicate routineKey → error"
    )
  }

  // ─── Template generation ─────────────────────────────────────────────────────
  console.log("\n── Template generation ──")

  {
    const wb = await loadBuffer(await buildProductsTemplate())
    assert(!!wb.getWorksheet("Instructions"), "products template has Instructions sheet")
    assert(!!wb.getWorksheet("Products"), "products template has Products sheet")
    assert(!!wb.getWorksheet("Lookups"), "products template has Lookups sheet")
    const headers = wb.getWorksheet("Products")!.getRow(1).values as string[]
    assert(
      PRODUCT_HEADERS.every((h) => headers.includes(h)),
      "products template header row matches columns"
    )
  }
  {
    const wb = await loadBuffer(await buildDiagnosesTemplate())
    assert(
      !!wb.getWorksheet("Instructions") && !!wb.getWorksheet("Diagnoses"),
      "diagnoses template has Instructions + Diagnoses sheets"
    )
  }
  {
    const wb = await loadBuffer(await buildRoutineTypesTemplate())
    assert(
      !!wb.getWorksheet("Instructions") && !!wb.getWorksheet("Routine Types"),
      "routine types template has Instructions + Routine Types sheets"
    )
  }

  // ─── DB-backed: dry-run no writes, commit, audit, skip, rollback ─────────────
  if (process.env.DATABASE_URL) {
    await runDbTests()
  } else {
    console.log("\n⚠  DATABASE_URL not set — skipping DB tests (commit/audit/rollback).")
  }

  console.log("\n─────────────────────────────────")
  console.log(exitCode === 0 ? "All Excel import tests passed ✅" : "Some tests FAILED ❌")
  process.exit(exitCode)
}

async function runDbTests() {
  console.log("\n── DB-backed import (dry-run, commit, audit, rollback) ──")
  const { prisma } = await import("../src/lib/prisma")
  const {
    previewProductsImport,
    commitProductsImport,
  } = await import("../src/lib/server/excel/products")

  const runId = crypto.randomUUID().slice(0, 8).toUpperCase()
  const skus = [`IMP-${runId}-1`, `IMP-${runId}-2`]

  // Build a products workbook buffer with run-specific SKUs.
  const wb = makeWorkbook([
    {
      name: "Products",
      headers: PRODUCT_HEADERS,
      rows: [
        [skus[0], `Imp ${runId} One`, "CLEANSER", "Face", "", "TRUE"],
        [skus[1], `Imp ${runId} Two`, "TONER", "Face", "", "TRUE"],
      ],
    },
  ])
  type WriteBuf = Awaited<ReturnType<typeof wb.xlsx.writeBuffer>>
  const arr = (await wb.xlsx.writeBuffer()) as WriteBuf
  const buffer = Buffer.from(arr as ArrayBuffer)

  // Track audit-log ids so cleanup targets only this run's exact rows.
  async function importAuditIds(): Promise<Set<string>> {
    const rows = await prisma.auditLog.findMany({
      where: { action: "IMPORT", entityType: "Product" },
      select: { id: true },
    })
    return new Set(rows.map((r) => r.id))
  }

  const probeSku = `IMP-${runId}-ROLLBACK`
  try {
    const before = await prisma.product.count()
    const auditIdsBefore = await importAuditIds()

    // Dry run must not write.
    const preview = await previewProductsImport(buffer)
    const afterPreview = await prisma.product.count()
    assert(preview.toCreate === 2, "DB dry-run preview → create 2")
    assert(before === afterPreview, "dry-run performs no writes")

    // Commit.
    const result = await commitProductsImport(buffer, null)
    assert(result.created === 2, "commit creates 2 products")
    const made = await prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true } })
    assert(made.length === 2, "both products exist after commit")

    const auditIdsAfter = await importAuditIds()
    const newAuditIds = [...auditIdsAfter].filter((id) => !auditIdsBefore.has(id))
    assert(newAuditIds.length === 1, "commit writes exactly one audit entry")

    // Re-commit same buffer → all skipped via existingSkuSet, no new audit.
    const result2 = await commitProductsImport(buffer, null)
    assert(result2.created === 0 && result2.skipped === 2, "re-commit skips existing")
    const auditIdsAfter2 = await importAuditIds()
    assert(
      [...auditIdsAfter2].filter((id) => !auditIdsAfter.has(id)).length === 0,
      "no audit entry when nothing is created"
    )

    // Test concurrent import of a new buffer to trigger createMany skipDuplicates.
    const skusC = [`IMP-${runId}-C1`, `IMP-${runId}-C2`]
    const wbC = makeWorkbook([
      {
        name: "Products",
        headers: PRODUCT_HEADERS,
        rows: [
          [skusC[0], `Imp ${runId} C1`, "CLEANSER", "Face", "", "TRUE"],
          [skusC[1], `Imp ${runId} C2`, "TONER", "Face", "", "TRUE"],
        ],
      },
    ])
    const arrC = (await wbC.xlsx.writeBuffer()) as WriteBuf
    const bufferC = Buffer.from(arrC as ArrayBuffer)

    const [resA, resB] = await Promise.all([
      commitProductsImport(bufferC, null),
      commitProductsImport(bufferC, null),
    ])
    assert(
      resA.created + resB.created === 2,
      "concurrent import exactly creates 2 records"
    )
    assert(
      resA.skipped + resB.skipped === 2,
      "concurrent duplicate accurately increments skipped count via createMany skipDuplicates"
    )

    // Rollback: a create + throw inside one transaction leaves nothing behind.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.product.create({
          data: { sku: probeSku, name: "rollback probe", stepType: "CLEANSER" },
        })
        throw new Error("forced failure")
      })
    } catch {
      /* expected */
    }
    const probe = await prisma.product.findUnique({ where: { sku: probeSku } })
    assert(probe === null, "transaction rollback leaves no partial data")

    // Cleanup only this run's exact records.
    await prisma.product.deleteMany({ where: { sku: { in: [...skus, ...skusC, probeSku] } } })
    if (newAuditIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: newAuditIds } } })
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
