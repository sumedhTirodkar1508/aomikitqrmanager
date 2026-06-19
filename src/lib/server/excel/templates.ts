/**
 * XLSX template generators for each admin import.
 *
 * Each workbook has an Instructions sheet, the data sheet(s) with a styled,
 * frozen header row, and (where useful) a Lookups sheet plus data-validation
 * dropdowns. All DB-sourced values are run through `escapeSpreadsheetValue` to
 * defend against CSV/formula injection in the generated file.
 */

import type ExcelJS from "exceljs"
import { prisma } from "@/lib/prisma"
import { escapeSpreadsheetValue } from "@/lib/spreadsheet-safe"
import { newWorkbook, workbookToBuffer } from "./core"
import { STEP_TYPES } from "./products"
import { PRODUCTS_SHEET, PRODUCTS_COLUMNS } from "./products"
import { DIAGNOSES_SHEET } from "./diagnoses"
import { ROUTINE_TYPES_SHEET } from "./routine-types"
import { SLUG_ENTITY_COLUMNS, SLUG_ENTITY_COLUMNS_WITH_DESC } from "./slug-entity"
import {
  ROUTINES_SHEET,
  ROUTINE_DIAGNOSES_SHEET,
  ROUTINE_STEPS_SHEET,
  ROUTINES_COLUMNS,
  ROUTINE_DIAGNOSES_COLUMNS,
  ROUTINE_STEPS_COLUMNS,
} from "./routines"

const VALIDATION_ROWS = 200

function addInstructions(
  wb: ExcelJS.Workbook,
  title: string,
  lines: string[]
): void {
  const ws = wb.addWorksheet("Instructions")
  ws.getColumn(1).width = 100
  const heading = ws.addRow([title])
  heading.font = { bold: true, size: 14 }
  ws.addRow([])
  for (const line of lines) {
    ws.addRow([escapeSpreadsheetValue(line)])
  }
}

function addDataSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: readonly string[]
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name)
  const header = ws.addRow([...headers])
  header.font = { bold: true }
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFEFEF" },
    }
  })
  ws.views = [{ state: "frozen", ySplit: 1 }]
  for (let i = 1; i <= headers.length; i++) {
    ws.getColumn(i).width = Math.max(16, headers[i - 1].length + 4)
  }
  return ws
}

function colLetter(index: number): string {
  // 1 → A, 2 → B, …
  let n = index
  let s = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function applyInlineDropdown(
  ws: ExcelJS.Worksheet,
  columnIndex: number,
  values: string[]
): void {
  const letter = colLetter(columnIndex)
  for (let r = 2; r <= VALIDATION_ROWS + 1; r++) {
    ws.getCell(`${letter}${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${values.join(",")}"`],
    }
  }
}

function applyRangeDropdown(
  ws: ExcelJS.Worksheet,
  columnIndex: number,
  rangeFormula: string
): void {
  const letter = colLetter(columnIndex)
  for (let r = 2; r <= VALIDATION_ROWS + 1; r++) {
    ws.getCell(`${letter}${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [rangeFormula],
    }
  }
}

const BOOLEAN_VALUES = ["TRUE", "FALSE"]

// ── Products ──────────────────────────────────────────────────────────────────

export async function buildProductsTemplate(): Promise<Buffer> {
  const wb = newWorkbook()
  addInstructions(wb, "AOMI Products Import — Instructions", [
    "Fill in the Products sheet. One product per row.",
    "Columns: sku, name, stepType, category, functionDescription, isActive.",
    "sku is the stable business identifier and must be unique within the file.",
    "Existing SKUs are skipped (never overwritten). Only new SKUs are created.",
    "stepType must be one of the allowed values (see the Lookups sheet).",
    "isActive accepts TRUE/FALSE (defaults to TRUE when left blank).",
    "Do not use formulas — enter plain values only. Maximum 5000 rows.",
    "Product images and replacement rules are NOT imported by this template.",
  ])

  const ws = addDataSheet(wb, PRODUCTS_SHEET, PRODUCTS_COLUMNS)
  const stepTypeIdx = PRODUCTS_COLUMNS.indexOf("stepType") + 1
  const isActiveIdx = PRODUCTS_COLUMNS.indexOf("isActive") + 1
  applyInlineDropdown(ws, stepTypeIdx, STEP_TYPES)
  applyInlineDropdown(ws, isActiveIdx, BOOLEAN_VALUES)

  const lookups = wb.addWorksheet("Lookups")
  lookups.getColumn(1).width = 20
  lookups.addRow(["Allowed stepType values"]).font = { bold: true }
  for (const st of STEP_TYPES) lookups.addRow([st])

  return workbookToBuffer(wb)
}

// ── Slug entities (diagnoses, routine types) ────────────────────────────────────

async function buildSlugTemplate(
  sheetName: string,
  title: string,
  noun: string,
  columns: readonly string[]
): Promise<Buffer> {
  const wb = newWorkbook()
  addInstructions(wb, title, [
    `Fill in the ${sheetName} sheet. One ${noun} per row.`,
    `Columns: ${columns.join(", ")}.`,
    "slug is the stable business identifier and must be unique within the file.",
    "Slugs are normalized to lowercase-hyphen form automatically.",
    "Existing slugs are skipped (never overwritten). Only new slugs are created.",
    "isActive accepts TRUE/FALSE (defaults to TRUE when left blank).",
    "Do not use formulas — enter plain values only. Maximum 5000 rows.",
  ])
  const ws = addDataSheet(wb, sheetName, columns)
  const isActiveIdx = columns.indexOf("isActive") + 1
  applyInlineDropdown(ws, isActiveIdx, BOOLEAN_VALUES)
  return workbookToBuffer(wb)
}

export function buildDiagnosesTemplate(): Promise<Buffer> {
  return buildSlugTemplate(
    DIAGNOSES_SHEET,
    "AOMI Diagnoses Import — Instructions",
    "diagnosis",
    SLUG_ENTITY_COLUMNS_WITH_DESC
  )
}

export function buildRoutineTypesTemplate(): Promise<Buffer> {
  return buildSlugTemplate(
    ROUTINE_TYPES_SHEET,
    "AOMI Routine Types Import — Instructions",
    "routine type",
    SLUG_ENTITY_COLUMNS
  )
}

// ── Routines (multi-sheet with DB-populated Lookups + range dropdowns) ──────────

export async function buildRoutinesTemplate(): Promise<Buffer> {
  const wb = newWorkbook()
  addInstructions(wb, "AOMI Routines Import — Instructions", [
    "This workbook builds full routines across three linked sheets.",
    "routineKey is a workbook-local handle that joins the sheets. It is NOT a database id.",
    "Routines sheet: one routine per row (routineKey, name, routineTypeSlug, durationDays, description, generalInstructions, isActive).",
    "Routine Diagnoses sheet: link routines to diagnoses (routineKey, diagnosisSlug). One pair per row.",
    "Routine Steps sheet: ordered steps (routineKey, stepNumber, stepType, defaultProductSku, instruction).",
    "routineTypeSlug, diagnosisSlug, and defaultProductSku must reference existing ACTIVE records — see the Lookups sheet.",
    "A step's defaultProductSku must have the same stepType as the step.",
    "stepNumber must be a positive integer and unique within a routine. Every routine needs at least one step.",
    "Existing routine names are skipped (never overwritten).",
    "Do not use formulas — enter plain values only.",
  ])

  addDataSheet(wb, ROUTINES_SHEET, ROUTINES_COLUMNS)
  addDataSheet(wb, ROUTINE_DIAGNOSES_SHEET, ROUTINE_DIAGNOSES_COLUMNS)
  const stepsWs = addDataSheet(wb, ROUTINE_STEPS_SHEET, ROUTINE_STEPS_COLUMNS)

  // Populate Lookups from the active catalog.
  const [routineTypes, diagnoses, products] = await Promise.all([
    prisma.routineType.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
    prisma.diagnosis.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
    prisma.product.findMany({
      where: { active: true, sku: { not: null } },
      orderBy: { name: "asc" },
      select: { sku: true, name: true, stepType: true },
    }),
  ])

  const lookups = wb.addWorksheet("Lookups")
  // Columns: A routineTypeSlug | B diagnosisSlug | C productSku | D productStepType | E stepType enum
  lookups.addRow([
    "routineTypeSlug",
    "diagnosisSlug",
    "productSku",
    "productStepType",
    "stepType",
  ]).font = { bold: true }
  const maxLen = Math.max(
    routineTypes.length,
    diagnoses.length,
    products.length,
    STEP_TYPES.length
  )
  for (let i = 0; i < maxLen; i++) {
    lookups.addRow([
      escapeSpreadsheetValue(routineTypes[i]?.slug ?? ""),
      escapeSpreadsheetValue(diagnoses[i]?.slug ?? ""),
      escapeSpreadsheetValue(products[i]?.sku ?? ""),
      escapeSpreadsheetValue(products[i]?.stepType ?? ""),
      STEP_TYPES[i] ?? "",
    ])
  }
  for (let c = 1; c <= 5; c++) lookups.getColumn(c).width = 22

  // Dropdowns referencing the Lookups ranges (safe for long lists).
  const routinesWs = wb.getWorksheet(ROUTINES_SHEET)!
  if (routineTypes.length > 0) {
    applyRangeDropdown(
      routinesWs,
      ROUTINES_COLUMNS.indexOf("routineTypeSlug") + 1,
      `Lookups!$A$2:$A$${routineTypes.length + 1}`
    )
  }
  applyInlineDropdown(
    routinesWs,
    ROUTINES_COLUMNS.indexOf("isActive") + 1,
    BOOLEAN_VALUES
  )

  const diagWs = wb.getWorksheet(ROUTINE_DIAGNOSES_SHEET)!
  if (diagnoses.length > 0) {
    applyRangeDropdown(
      diagWs,
      ROUTINE_DIAGNOSES_COLUMNS.indexOf("diagnosisSlug") + 1,
      `Lookups!$B$2:$B$${diagnoses.length + 1}`
    )
  }

  applyInlineDropdown(
    stepsWs,
    ROUTINE_STEPS_COLUMNS.indexOf("stepType") + 1,
    STEP_TYPES
  )
  if (products.length > 0) {
    applyRangeDropdown(
      stepsWs,
      ROUTINE_STEPS_COLUMNS.indexOf("defaultProductSku") + 1,
      `Lookups!$C$2:$C$${products.length + 1}`
    )
  }

  return workbookToBuffer(wb)
}
