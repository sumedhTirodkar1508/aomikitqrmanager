/**
 * Shared parser/preview for slug-keyed single-sheet entities (diagnoses,
 * routine types). Both have identical columns: slug, name, description, isActive.
 *
 * Slugs are normalized with the app convention (`toSlug`). Duplicate normalized
 * slugs within the file are errors. Existence is resolved by the caller.
 */

import type ExcelJS from "exceljs"
import { toSlug } from "@/lib/slug"
import {
  extractSheet,
  parseExcelBoolean,
  type ImportError,
  type ImportPreview,
} from "./core"

export const SLUG_ENTITY_COLUMNS = ["slug", "name", "isActive"] as const
export const SLUG_ENTITY_COLUMNS_WITH_DESC = ["slug", "name", "description", "isActive"] as const

export interface SlugCandidate {
  rowNumber: number
  slug: string
  name: string
  description?: string | null
  isActive: boolean
}

export interface ParsedSlugEntity {
  totalRows: number
  candidates: SlugCandidate[]
  invalidRows: Set<number>
  errors: ImportError[]
}

export function parseSlugSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  options?: { parseDescription?: boolean }
): ParsedSlugEntity {
  const columns = options?.parseDescription ? SLUG_ENTITY_COLUMNS_WITH_DESC : SLUG_ENTITY_COLUMNS
  const { rows, errors } = extractSheet(workbook, sheetName, [...columns])
  const invalidRows = new Set<number>()
  for (const e of errors) if (e.row > 1) invalidRows.add(e.row)

  // Normalize slugs first to detect in-file duplicates by normalized value.
  const normalized = new Map<number, string>()
  const slugCounts = new Map<string, number>()
  for (const row of rows) {
    const slug = toSlug(row.values.slug)
    normalized.set(row.rowNumber, slug)
    if (slug) slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1)
  }

  const candidates: SlugCandidate[] = []
  for (const row of rows) {
    const r = row.rowNumber
    let rowInvalid = false
    const fail = (field: string, message: string) => {
      errors.push({ sheet: sheetName, row: r, field, message })
      invalidRows.add(r)
      rowInvalid = true
    }

    const slug = normalized.get(r) ?? ""
    const name = row.values.name.trim()
    const description = options?.parseDescription ? (row.values.description?.trim() ?? "") : ""
    const isActiveRaw = row.values.isActive.trim()

    if (!row.values.slug.trim()) fail("slug", "Slug is required")
    else if (!slug) fail("slug", "Slug normalizes to an empty value")
    else if (slug.length > 200) fail("slug", "Slug exceeds 200 characters")
    else if ((slugCounts.get(slug) ?? 0) > 1)
      fail("slug", "Duplicate slug within the file")

    if (!name) fail("name", "Name is required")
    else if (name.length > 200) fail("name", "Name exceeds 200 characters")

    if (options?.parseDescription && description.length > 1000)
      fail("description", "Description exceeds 1000 characters")

    let isActive = true
    if (isActiveRaw) {
      const b = parseExcelBoolean(isActiveRaw)
      if (b === null) fail("isActive", `Invalid boolean "${isActiveRaw}"`)
      else isActive = b
    }

    if (rowInvalid) continue
    const candidate: SlugCandidate = {
      rowNumber: r,
      slug,
      name,
      isActive,
    }
    if (options?.parseDescription) {
      candidate.description = description || null
    }
    candidates.push(candidate)
  }

  return { totalRows: rows.length, candidates, invalidRows, errors }
}

export function buildSlugPreview(
  entity: string,
  parsed: ParsedSlugEntity,
  existingSlugs: Set<string>
): ImportPreview {
  const createSamples: string[] = []
  const skipSamples: string[] = []
  let toCreate = 0
  let toSkip = 0

  for (const c of parsed.candidates) {
    if (existingSlugs.has(c.slug)) {
      toSkip++
      if (skipSamples.length < 20) skipSamples.push(c.slug)
    } else {
      toCreate++
      if (createSamples.length < 20) createSamples.push(`${c.slug} — ${c.name}`)
    }
  }

  return {
    entity,
    totalRows: parsed.totalRows,
    toCreate,
    toSkip,
    invalid: parsed.invalidRows.size,
    errors: parsed.errors,
    createSamples,
    skipSamples,
  }
}
