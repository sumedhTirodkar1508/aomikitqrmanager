/**
 * Routine Types Excel importer.
 *
 * Workbook: AOMI_ROUTINE_TYPES_TEMPLATE_V1.xlsx — sheets Instructions, Routine Types.
 * Columns: slug, name, isActive. Slug is the stable identifier.
 */

import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { loadWorkbook, type ImportPreview, type ImportCommitResult } from "./core"
import { parseSlugSheet, buildSlugPreview } from "./slug-entity"

export const ROUTINE_TYPES_SHEET = "Routine Types"
const ENTITY = "routine types"

async function existingSlugSet(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set()
  const found = await prisma.routineType.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true },
  })
  return new Set(found.map((rt) => rt.slug))
}

export async function previewRoutineTypesImport(
  buffer: Buffer
): Promise<ImportPreview> {
  const workbook = await loadWorkbook(buffer)
  const parsed = parseSlugSheet(workbook, ROUTINE_TYPES_SHEET)
  const existing = await existingSlugSet(parsed.candidates.map((c) => c.slug))
  return buildSlugPreview(ENTITY, parsed, existing)
}

export async function commitRoutineTypesImport(
  buffer: Buffer,
  userId: string | null
): Promise<ImportCommitResult> {
  const workbook = await loadWorkbook(buffer)
  const parsed = parseSlugSheet(workbook, ROUTINE_TYPES_SHEET)
  const existing = await existingSlugSet(parsed.candidates.map((c) => c.slug))

  const toCreate = parsed.candidates.filter((c) => !existing.has(c.slug))
  let skipped = parsed.candidates.length - toCreate.length

  let created = 0
  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      const result = await tx.routineType.createMany({
        data: toCreate.map((c) => ({
          slug: c.slug,
          name: c.name,
          active: c.isActive,
        })),
        skipDuplicates: true,
      })
      created = result.count
      skipped += toCreate.length - created

      await writeAuditLog(
        userId,
        "IMPORT",
        "RoutineType",
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
