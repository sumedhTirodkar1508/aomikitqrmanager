import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkMobileApiKey } from "@/lib/mobile-api"
import { normalizeToken } from "@/lib/token"

const NO_STORE = { "Cache-Control": "no-store" } as const

const BodySchema = z.object({
  token: z.string().trim().min(1).max(500),
  externalUserId: z.string().trim().max(200).optional(),
})

export async function POST(req: NextRequest) {
  const authError = checkMobileApiKey(req)
  if (authError) return authError

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE }
    )
  }

  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "token is required" },
      { status: 400, headers: NO_STORE }
    )
  }

  const token = normalizeToken(parsed.data.token)
  const externalUserId = parsed.data.externalUserId ?? null

  const record = await prisma.qRToken.findUnique({
    where: { token },
    include: { package: { select: { id: true } } },
  })
  if (!record) {
    return NextResponse.json(
      { error: "Token not found" },
      { status: 404, headers: NO_STORE }
    )
  }

  // Idempotent: already activated.
  if (record.status === "ACTIVATED") {
    return NextResponse.json(
      {
        token: record.token,
        status: "ACTIVATED",
        activatedAt: record.activatedAt,
        message: "Token already activated",
      },
      { headers: NO_STORE }
    )
  }

  if (record.status !== "ASSIGNED") {
    return NextResponse.json(
      {
        token: record.token,
        status: record.status,
        error: `Token cannot be activated from status ${record.status}`,
      },
      { status: 409, headers: NO_STORE }
    )
  }

  // Race-safe transition ASSIGNED -> ACTIVATED.
  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.qRToken.updateMany({
      where: { id: record.id, status: "ASSIGNED" },
      data: { status: "ACTIVATED", activatedAt: new Date() },
    })
    if (claim.count === 0) {
      return { raced: true as const }
    }

    await tx.package.updateMany({
      where: { qrTokenId: record.id },
      data: { status: "ACTIVATED" },
    })

    await tx.activationEvent.create({
      data: {
        qrTokenId: record.id,
        packageId: record.package?.id ?? null,
        externalUserId,
        eventType: "ACTIVATED",
        metadataJson: externalUserId ? { externalUserId } : undefined,
      },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: "ACTIVATE",
        entityType: "QRToken",
        entityId: record.id,
        metadataJson: externalUserId ? { externalUserId } : undefined,
      },
    })

    const updated = await tx.qRToken.findUnique({
      where: { id: record.id },
      select: { token: true, status: true, activatedAt: true },
    })
    return { raced: false as const, updated }
  })

  if (result.raced) {
    // Someone activated concurrently — re-read and report idempotent success.
    const fresh = await prisma.qRToken.findUnique({
      where: { id: record.id },
      select: { token: true, status: true, activatedAt: true },
    })
    return NextResponse.json(
      {
        token: fresh?.token ?? token,
        status: fresh?.status ?? "ACTIVATED",
        activatedAt: fresh?.activatedAt ?? null,
        message: "Token already activated",
      },
      { headers: NO_STORE }
    )
  }

  return NextResponse.json(
    {
      token: result.updated?.token ?? token,
      status: result.updated?.status ?? "ACTIVATED",
      activatedAt: result.updated?.activatedAt ?? null,
      message: "Token activated",
    },
    { headers: NO_STORE }
  )
}
