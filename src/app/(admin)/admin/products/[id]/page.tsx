import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { updateProduct, toggleProductActive } from "../actions"
import ProductForm from "../_components/product-form"
import ProductImages from "./_components/product-images"
import ReplacementRules from "./_components/replacement-rules"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await prisma.product.findUnique({
    where: { id },
    select: { name: true },
  })
  return { title: product ? `${product.name} — AOMI Kit Admin` : "Product" }
}

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}) {
  await requireRole("ADMIN")
  const { id } = await params
  const sp = await searchParams
  const isCreated = sp.created === "true"

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      replacementSources: {
        orderBy: { createdAt: "asc" },
        include: {
          replacement: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  })
  if (!product) notFound()

  const otherProducts = await prisma.product.findMany({
    where: { active: true, id: { not: id } },
    orderBy: [{ stepType: "asc" }, { name: "asc" }],
    select: { id: true, name: true, stepType: true },
  })

  const action = updateProduct.bind(null, id)

  return (
    <div className="app-page">
      {isCreated && (
        <div className="rounded-2xl bg-success px-4 py-3 text-sm text-success-foreground">
          Product created. You can now add images and replacement rules from Manage product details.
        </div>
      )}

      <PageHeader
        title={product.name}
        description={
          <div className="space-y-1">
            <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link href="/admin/products" className="hover:underline">
                Products
              </Link>
              <span>/</span>
              <span className="font-medium text-foreground">{product.name}</span>
            </nav>
            <div className="flex items-center gap-2 text-sm pt-1">
              <StatusBadge status={product.active ? "ACTIVE" : "INACTIVE"} />
              {product.sku && (
                <span className="font-mono text-xs text-muted-foreground">
                  · SKU: {product.sku}
                </span>
              )}
            </div>
          </div>
        }
        action={
          <form action={toggleProductActive}>
            <input type="hidden" name="id" value={product.id} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className={
                product.active
                  ? "border-destructive/25 text-destructive hover:bg-destructive/10"
                  : "border-success text-success-foreground hover:bg-success"
              }
            >
              {product.active ? "Deactivate" : "Activate"}
            </Button>
          </form>
        }
      />

      <Card>
        <CardHeader><CardTitle>Basic attributes</CardTitle><CardDescription>Core identity, category, and step classification for the product.</CardDescription></CardHeader>
        <CardContent>
          <ProductForm action={action} defaultValues={product} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Product images</CardTitle><CardDescription>Upload primary, secondary, and reference photos for the product.</CardDescription></CardHeader>
        <CardContent>
          <ProductImages productId={product.id} images={product.images} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Replacement rules</CardTitle><CardDescription>Define which products can replace this one in routine templates if unavailable.</CardDescription></CardHeader>
        <CardContent>
          <ReplacementRules
            sourceProductId={product.id}
            sourceStepType={product.stepType}
            rules={product.replacementSources}
            products={otherProducts}
          />
        </CardContent>
      </Card>
    </div>
  )
}
