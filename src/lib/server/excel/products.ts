/**
 * Products Excel importer: parse, preview (dry-run), and transactional commit.
 *
 * Workbook: AOMI_PRODUCTS_TEMPLATE_V1.xlsx — sheets Instructions, Products, Lookups.
 * Columns: sku, name, stepType, category, functionDescription, isActive.
 *
 * Policy: SKU is the stable business identifier. Duplicate SKUs within the file
 * are errors. Existing SKUs are SKIP_EXISTING (never overwritten). Only valid,
 * new rows are created — all in one transaction with a single audit entry.
 */

import type ExcelJS from "exceljs"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import type { StepType } from "@/generated/prisma/client"
import {
  extractSheet,
  parseExcelBoolean,
  loadWorkbook,
  type ImportError,
  type ImportPreview,
  type ImportCommitResult,
} from "./core"

export const PRODUCTS_SHEET = "Products"
export const PRODUCTS_COLUMNS = [
  "sku",
  "name",
  "stepType",
  "category",
  "functionDescription",
  "isActive",
] as const

export const STEP_TYPES: StepType[] = [
  "CLEANSER",
  "TONER",
  "SERUM",
  "CREAM",
  "SUNSCREEN",
  "EXFOLIANT",
  "TREATMENT",
  "MOISTURIZER",
]

const ENTITY = "products"

interface ProductCandidate {
  rowNumber: number
  sku: string
  name: string
  stepType: StepType
  category: string | null
  functionDescription: string | null
  isActive: boolean
}

interface ParsedProducts {
  totalRows: number
  candidates: ProductCandidate[]
  invalidRows: Set<number>
  errors: ImportError[]
}

export function parseProducts(workbook: ExcelJS.Workbook): ParsedProducts {
  const { rows, errors } = extractSheet(workbook, PRODUCTS_SHEET, [
    ...PRODUCTS_COLUMNS,
  ])
  const invalidRows = new Set<number>()
  for (const e of errors) if (e.row > 1) invalidRows.add(e.row)

  // First pass: collect SKUs to detect in-file duplicates.
  const skuCounts = new Map<string, number>()
  for (const row of rows) {
    const sku = row.values.sku.trim().toUpperCase()
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1)
  }

  const candidates: ProductCandidate[] = []
  for (const row of rows) {
    const r = row.rowNumber
    let rowInvalid = false
    const fail = (field: string, message: string) => {
      errors.push({ sheet: PRODUCTS_SHEET, row: r, field, message })
      invalidRows.add(r)
      rowInvalid = true
    }

    const sku = row.values.sku.trim().toUpperCase()
    const name = row.values.name.trim()
    const stepTypeRaw = row.values.stepType.trim().toUpperCase()
    const category = row.values.category.trim()
    const functionDescription = row.values.functionDescription.trim()
    const isActiveRaw = row.values.isActive.trim()

    if (!sku) fail("sku", "SKU is required")
    else if (sku.length > 100) fail("sku", "SKU exceeds 100 characters")
    else if ((skuCounts.get(sku) ?? 0) > 1)
      fail("sku", "Duplicate SKU within the file")

    if (!name) fail("name", "Name is required")
    else if (name.length > 200) fail("name", "Name exceeds 200 characters")

    if (!stepTypeRaw) fail("stepType", "Step type is required")
    else if (!STEP_TYPES.includes(stepTypeRaw as StepType))
      fail("stepType", `Invalid step type "${row.values.stepType}"`)

    if (category.length > 100) fail("category", "Category exceeds 100 characters")
    if (functionDescription.length > 1000)
      fail("functionDescription", "Function description exceeds 1000 characters")

    let isActive = true
    if (isActiveRaw) {
      const b = parseExcelBoolean(isActiveRaw)
      if (b === null) fail("isActive", `Invalid boolean "${isActiveRaw}"`)
      else isActive = b
    }

    if (rowInvalid) continue
    candidates.push({
      rowNumber: r,
      sku,
      name,
      stepType: stepTypeRaw as StepType,
      category: category || null,
      functionDescription: functionDescription || null,
      isActive,
    })
  }

  return {
    totalRows: rows.length,
    candidates,
    invalidRows,
    errors,
  }
}

export function buildProductsPreview(
  parsed: ParsedProducts,
  existingSkus: Set<string>
): ImportPreview {
  const createSamples: string[] = []
  const skipSamples: string[] = []
  let toCreate = 0
  let toSkip = 0

  for (const c of parsed.candidates) {
    if (existingSkus.has(c.sku)) {
      toSkip++
      if (skipSamples.length < 20) skipSamples.push(c.sku)
    } else {
      toCreate++
      if (createSamples.length < 20) createSamples.push(`${c.sku} — ${c.name}`)
    }
  }

  return {
    entity: ENTITY,
    totalRows: parsed.totalRows,
    toCreate,
    toSkip,
    invalid: parsed.invalidRows.size,
    errors: parsed.errors,
    createSamples,
    skipSamples,
  }
}

async function existingSkuSet(skus: string[]): Promise<Set<string>> {
  if (skus.length === 0) return new Set()
  const found = await prisma.product.findMany({
    where: { sku: { in: skus } },
    select: { sku: true },
  })
  return new Set(found.map((p) => p.sku!).filter(Boolean))
}

export async function previewProductsImport(
  buffer: Buffer
): Promise<ImportPreview> {
  const workbook = await loadWorkbook(buffer)
  const parsed = parseProducts(workbook)
  const existing = await existingSkuSet(parsed.candidates.map((c) => c.sku))
  return buildProductsPreview(parsed, existing)
}

export async function commitProductsImport(
  buffer: Buffer,
  userId: string | null
): Promise<ImportCommitResult> {
  // Re-parse and re-check existence immediately before writing (revalidation).
  const workbook = await loadWorkbook(buffer)
  const parsed = parseProducts(workbook)
  const existing = await existingSkuSet(parsed.candidates.map((c) => c.sku))

  const toCreate = parsed.candidates.filter((c) => !existing.has(c.sku))
  let skipped = parsed.candidates.length - toCreate.length

  let created = 0
  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      const result = await tx.product.createMany({
        data: toCreate.map((c) => ({
          sku: c.sku,
          name: c.name,
          stepType: c.stepType,
          category: c.category,
          functionDescription: c.functionDescription,
          active: c.isActive,
        })),
        // DB unique constraint is the final guard against a concurrent insert.
        skipDuplicates: true,
      })
      created = result.count
      skipped += toCreate.length - created

      await writeAuditLog(
        userId,
        "IMPORT",
        "Product",
        "bulk",
        { entity: ENTITY, created, skipped },
        tx
      )
    })
  }

  return {
    entity: ENTITY,
    created,
    skipped,
    invalid: parsed.invalidRows.size,
    errors: parsed.errors,
  }
}
