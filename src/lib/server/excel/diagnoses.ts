/**
 * Diagnoses Excel importer.
 *
 * Workbook: AOMI_DIAGNOSES_TEMPLATE_V1.xlsx — sheets Instructions, Diagnoses.
 * Columns: slug, name, description, isActive. Slug is the stable identifier.
 */

import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { loadWorkbook, type ImportPreview, type ImportCommitResult } from "./core"
import { parseSlugSheet, buildSlugPreview } from "./slug-entity"

export const DIAGNOSES_SHEET = "Diagnoses"
const ENTITY = "diagnoses"

async function existingSlugSet(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set()
  const found = await prisma.diagnosis.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true },
  })
  return new Set(found.map((d) => d.slug))
}

export async function previewDiagnosesImport(
  buffer: Buffer
): Promise<ImportPreview> {
  const workbook = await loadWorkbook(buffer)
  const parsed = parseSlugSheet(workbook, DIAGNOSES_SHEET, { parseDescription: true })
  const existing = await existingSlugSet(parsed.candidates.map((c) => c.slug))
  return buildSlugPreview(ENTITY, parsed, existing)
}

export async function commitDiagnosesImport(
  buffer: Buffer,
  userId: string | null
): Promise<ImportCommitResult> {
  const workbook = await loadWorkbook(buffer)
  const parsed = parseSlugSheet(workbook, DIAGNOSES_SHEET, { parseDescription: true })
  const existing = await existingSlugSet(parsed.candidates.map((c) => c.slug))

  const toCreate = parsed.candidates.filter((c) => !existing.has(c.slug))
  const skipped = parsed.candidates.length - toCreate.length

  let created = 0
  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.diagnosis.createMany({
        data: toCreate.map((c) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
          active: c.isActive,
        })),
        skipDuplicates: true,
      })
      created = toCreate.length
      await writeAuditLog(
        userId,
        "IMPORT",
        "Diagnosis",
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
