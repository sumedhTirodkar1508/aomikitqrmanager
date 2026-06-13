"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"
import { writeAuditLog } from "@/lib/audit"
import { generateTokens, DEFAULT_PREFIX } from "@/lib/token"

export type GenerateState = { error?: string }

const GenerateSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(10000),
  prefix: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9-]+$/, "Prefix may only contain letters, numbers, and dashes")
    .optional(),
  batchName: z.string().trim().max(120).optional(),
})

export async function generateBatch(
  _prevState: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  const { user } = await requireRole("ADMIN")

  const parsed = GenerateSchema.safeParse({
    quantity: formData.get("quantity"),
    prefix: (formData.get("prefix") as string) || undefined,
    batchName: (formData.get("batchName") as string) || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const quantity = parsed.data.quantity
  const prefix = (parsed.data.prefix ?? DEFAULT_PREFIX).toUpperCase()

  // Generate a candidate set, then retry the portion that collides with the DB.
  const collected = new Set<string>()
  let safety = 0
  while (collected.size < quantity && safety < 25) {
    const need = quantity - collected.size
    const candidates = generateTokens(need * 2, prefix).filter(
      (t) => !collected.has(t)
    )
    if (candidates.length === 0) {
      safety += 1
      continue
    }
    const existing = await prisma.qRToken.findMany({
      where: { token: { in: candidates } },
      select: { token: true },
    })
    const existingSet = new Set(existing.map((e) => e.token))
    for (const t of candidates) {
      if (collected.size >= quantity) break
      if (!existingSet.has(t)) collected.add(t)
    }
    safety += 1
  }

  if (collected.size < quantity) {
    return { error: "Could not generate enough unique tokens. Try again." }
  }

  const tokens = Array.from(collected).slice(0, quantity)

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.qRTokenBatch.create({
      data: {
        batchName: parsed.data.batchName || null,
        prefix,
        quantity,
        source: "GENERATED",
        createdByUserId: user.id,
      },
    })
    await tx.qRToken.createMany({
      data: tokens.map((token) => ({
        token,
        batchId: created.id,
        status: "AVAILABLE" as const,
        generatedByUserId: user.id,
      })),
    })
    await writeAuditLog(user.id, "GENERATE_BATCH", "QRTokenBatch", created.id, { quantity, prefix }, tx)
    return created
  })

  revalidatePath("/admin/qr-tokens")
  revalidatePath("/admin/batches")
  redirect(`/admin/qr-tokens?batch=${batch.id}`)
}
