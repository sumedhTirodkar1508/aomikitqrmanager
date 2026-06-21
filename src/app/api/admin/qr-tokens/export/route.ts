import type { NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { prisma } from "@/lib/prisma"
import type { Prisma, QRTokenStatus } from "@/generated/prisma/client"

// 500 rows per chunk: each row is ~100 bytes → ~50 KB in memory at peak.
// Large exports (100k rows) need ~200 DB round-trips; the streaming latency is
// dominated by network transfer, not query overhead at this chunk size.
const CHUNK_SIZE = 500

const STATUSES: QRTokenStatus[] = [
  "AVAILABLE",
  "ASSIGNED",
  "ACTIVATED",
  "VOIDED",
  "REPLACED",
]

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatRow(t: {
  token: string
  status: string
  batchId: string | null
  batch: { batchName: string | null; source: string } | null
  createdAt: Date
  assignedAt: Date | null
  activatedAt: Date | null
  voidedAt: Date | null
  notes: string | null
}): string {
  return (
    [
      csvEscape(t.token),
      csvEscape(t.status),
      csvEscape(t.batchId ?? ""),
      csvEscape(t.batch?.batchName ?? ""),
      csvEscape(t.createdAt.toISOString()),
      csvEscape(t.assignedAt ? t.assignedAt.toISOString() : ""),
      csvEscape(t.activatedAt ? t.activatedAt.toISOString() : ""),
      csvEscape(t.voidedAt ? t.voidedAt.toISOString() : ""),
      csvEscape(t.batch?.source ?? ""),
      csvEscape(t.notes ?? ""),
    ].join(",") + "\n"
  )
}

export async function GET(req: NextRequest) {
  // DB-backed auth so deactivated admins are rejected at request time.
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const batch = searchParams.get("batch")

  const where: Prisma.QRTokenWhereInput = {}
  if (status && STATUSES.includes(status as QRTokenStatus)) {
    where.status = status as QRTokenStatus
  }
  if (batch) where.batchId = batch

  const filename = `qr-tokens-${new Date().toISOString().slice(0, 10)}.csv`
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("token,status,batchId,batchName,createdAt,assignedAt,activatedAt,voidedAt,source,notes\n"))

        // Cursor-based pagination over (createdAt ASC, id ASC).
        // `id` (cuid) is the cursor field — unique and monotonically increasing
        // within the same createdAt second, giving a fully deterministic order.
        let cursorId: string | undefined = undefined

        for (;;) {
          type Row = {
            id: string
            token: string
            status: string
            batchId: string | null
            batch: { batchName: string | null; source: string } | null
            createdAt: Date
            assignedAt: Date | null
            activatedAt: Date | null
            voidedAt: Date | null
            notes: string | null
          }
          let chunk: Row[]
          const select = {
            id: true,
            token: true,
            status: true,
            batchId: true,
            batch: { select: { batchName: true, source: true } },
            createdAt: true,
            assignedAt: true,
            activatedAt: true,
            voidedAt: true,
            notes: true,
          } as const
          const orderBy = [{ createdAt: "asc" as const }, { id: "asc" as const }]
          if (cursorId) {
            chunk = await prisma.qRToken.findMany({
              where, orderBy, take: CHUNK_SIZE,
              cursor: { id: cursorId }, skip: 1, select,
            })
          } else {
            chunk = await prisma.qRToken.findMany({
              where, orderBy, take: CHUNK_SIZE, select,
            })
          }

          if (chunk.length === 0) break

          for (const row of chunk) {
            controller.enqueue(encoder.encode(formatRow(row)))
          }

          cursorId = chunk[chunk.length - 1].id

          // Stop if this was a partial chunk — no more rows exist.
          if (chunk.length < CHUNK_SIZE) break
        }

        controller.close()
      } catch {
        // Do not expose error details in the stream body; close cleanly.
        controller.error(new Error("Export failed"))
      }
    },
    cancel() {
      // Client disconnected — stream is abandoned; nothing to clean up.
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Transfer-Encoding": "chunked",
    },
  })
}
