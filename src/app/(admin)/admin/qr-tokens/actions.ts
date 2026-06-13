"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"
import { writeAuditLog } from "@/lib/audit"

export type TokenActionState = { error?: string; ok?: boolean }

/**
 * Void a token. Only AVAILABLE or ASSIGNED tokens may be voided.
 *
 * When an ASSIGNED token is voided its linked Package is also transitioned to
 * VOIDED in the same database transaction, keeping them in sync. The audit log
 * is written inside the same transaction so that a log entry cannot exist
 * without the corresponding state change (and vice-versa).
 */
export async function voidToken(
  _prevState: TokenActionState,
  formData: FormData
): Promise<TokenActionState> {
  const { user } = await requireRole("ADMIN")
  const id = formData.get("id") as string
  if (!id) return { error: "Missing token id" }

  try {
    await prisma.$transaction(async (tx) => {
      // Race-safe: only update if currently AVAILABLE or ASSIGNED.
      const result = await tx.qRToken.updateMany({
        where: { id, status: { in: ["AVAILABLE", "ASSIGNED"] } },
        data: { status: "VOIDED", voidedAt: new Date() },
      })

      if (result.count === 0) {
        throw new Error("VOID_REJECTED")
      }

      // Sync the linked package (present only when token was ASSIGNED).
      await tx.package.updateMany({
        where: { qrTokenId: id, status: "ASSIGNED" },
        data: { status: "VOIDED" },
      })

      await writeAuditLog(user.id, "VOID", "QRToken", id, undefined, tx)
    })
  } catch (err) {
    if (err instanceof Error && err.message === "VOID_REJECTED") {
      return {
        error: "Token cannot be voided (already activated, voided, or replaced)",
      }
    }
    throw err
  }

  revalidatePath("/admin/qr-tokens")
  return { ok: true }
}
