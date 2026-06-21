import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkMobileApiKey } from "@/lib/mobile-api"
import { normalizeToken } from "@/lib/token"
import { resolveActivationRace } from "@/lib/server/activation-race"

const NO_STORE = { "Cache-Control": "no-store" } as const

const BodySchema = z
  .object({
    token: z.string().trim().min(1).max(500).optional(),
    qr_token: z.string().trim().min(1).max(500).optional(),
    externalUserId: z.string().trim().max(200).optional(),
    external_user_id: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.token || data.qr_token, {
    message: "token is required",
  })
  .transform((data) => ({
    token: (data.token || data.qr_token)!,
    externalUserId: data.externalUserId ?? data.external_user_id,
  }))

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

  if (!record.package) {
    return NextResponse.json(
      { error: "Token has no assigned package to activate" },
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

    const pkgUpdate = await tx.package.updateMany({
      where: { qrTokenId: record.id, status: "ASSIGNED" },
      data: { status: "ACTIVATED" },
    })
    if (pkgUpdate.count === 0) {
      throw new Error("PACKAGE_MISSING")
    }

    await tx.activationEvent.create({
      data: {
        qrTokenId: record.id,
        packageId: record.package!.id,
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
  }).catch((err) => {
    if (err instanceof Error && err.message === "PACKAGE_MISSING") {
      return { packageMissing: true as const }
    }
    throw err
  })

  if ("packageMissing" in result) {
    return NextResponse.json(
      { error: "Token has no valid assigned package to activate" },
      { status: 409, headers: NO_STORE }
    )
  }

  if (result.raced) {
    // Someone activated or modified concurrently — re-read.
    const fresh = await prisma.qRToken.findUnique({
      where: { id: record.id },
      select: { token: true, status: true, activatedAt: true },
    })

    return resolveActivationRace(fresh)
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
