import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkMobileApiKey } from "@/lib/mobile-api"
import { normalizeToken } from "@/lib/token"

const NO_STORE = { "Cache-Control": "no-store" } as const

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const authError = checkMobileApiKey(req)
  if (authError) return authError

  const { token: rawToken } = await params

  let decoded: string
  try {
    decoded = decodeURIComponent(rawToken)
  } catch {
    return NextResponse.json(
      { error: "Invalid token format" },
      { status: 400, headers: NO_STORE }
    )
  }

  const token = normalizeToken(decoded)

  const record = await prisma.qRToken.findUnique({
    where: { token },
    include: {
      package: {
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
              durationDays: true,
              generalInstructions: true,
              routineType: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
              diagnoses: {
                select: {
                  diagnosis: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
          products: { orderBy: { stepNumber: "asc" } },
        },
      },
    },
  })

  if (!record) {
    return NextResponse.json(
      { error: "Token not found" },
      { status: 404, headers: NO_STORE }
    )
  }

  if (record.status === "AVAILABLE") {
    return NextResponse.json(
      {
        token: record.token,
        status: "AVAILABLE",
        message: "Token not yet assigned",
      },
      { headers: NO_STORE }
    )
  }

  if (record.status === "VOIDED" || record.status === "REPLACED") {
    return NextResponse.json(
      {
        token: record.token,
        status: record.status,
        message:
          record.status === "VOIDED"
            ? "This token has been voided"
            : "This token has been replaced",
      },
      { headers: NO_STORE }
    )
  }

  // ASSIGNED or ACTIVATED — return full package payload.
  const pkg = record.package
  if (!pkg) {
    return NextResponse.json(
      {
        token: record.token,
        status: record.status,
        message: "No package associated with this token",
      },
      { headers: NO_STORE }
    )
  }

  // Resolve current product details + front image for each snapshot row.
  const productIds = Array.from(new Set(pkg.products.map((p) => p.productId)))
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      functionDescription: true,
      images: {
        orderBy: { sortOrder: "asc" },
        select: { imageUrl: true, imageType: true },
      },
    },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  function imageUrlFor(productId: string): string | null {
    const p = productMap.get(productId)
    if (!p || p.images.length === 0) return null
    return p.images[0].imageUrl
  }

  return NextResponse.json(
    {
      token: record.token,
      status: record.status,
      assignedAt: record.assignedAt,
      activatedAt: record.activatedAt,
      package: {
        id: pkg.id,
        status: pkg.status,
      },
      routine: {
        id: pkg.template.id,
        name: pkg.template.name,
        description: pkg.template.description,
        durationDays: pkg.template.durationDays,
        generalInstructions: pkg.template.generalInstructions,
        routineType: pkg.template.routineType,
        diagnoses: pkg.template.diagnoses.map((d) => d.diagnosis),
      },
      steps: pkg.products.map((sp) => {
        const p = productMap.get(sp.productId)
        return {
          stepNumber: sp.stepNumber,
          stepType: sp.stepType,
          instruction: sp.instruction,
          isReplacement: sp.isReplacement,
          product: {
            id: sp.productId,
            name: p?.name ?? "Unknown product",
            sku: p?.sku ?? null,
            category: p?.category ?? null,
            functionDescription: p?.functionDescription ?? null,
            imageUrl: imageUrlFor(sp.productId),
            primaryImageUrl: imageUrlFor(sp.productId),
          },
        }
      }),
    },
    { headers: NO_STORE }
  )
}
