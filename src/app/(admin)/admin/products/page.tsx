import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Pencil, Ban, CheckCircle, Plus, Eye, Box, Download } from "lucide-react"
import { ExcelImportDialog } from "@/components/admin/excel-import-dialog"
import { previewProductsExcel, commitProductsExcel } from "./import-actions"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { AdminFormSheet } from "@/components/ui/admin-form-sheet"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { toggleProductActive, createProduct, updateProduct } from "./actions"
import ProductForm from "./_components/product-form"
import { ToggleActiveForm } from "@/components/admin/toggle-active-form"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import type { Prisma } from "@/generated/prisma/client"
import { DataPagination } from "@/components/ui/data-pagination"
import { resolvePagination } from "@/lib/pagination"

export const metadata = { title: "Products — AOMI Kit Admin" }

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string; edit?: string; page?: string; pageSize?: string }>
}) {
  await requireRole("ADMIN")
  const { q, new: showNew, edit, page: pageParam, pageSize: pageSizeParam } = await searchParams

  const where: Prisma.ProductWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
        ],
      }
    : {}

  const [totalCount, editItem] = await Promise.all([
    prisma.product.count({ where }),
    edit ? prisma.product.findUnique({ where: { id: edit } }) : null,
  ])

  const { page, pageSize, totalPages, skip, take, from, to } = resolvePagination({
    page: pageParam,
    pageSize: pageSizeParam,
    totalCount,
  })

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ stepType: "asc" }, { name: "asc" }, { id: "asc" }],
    skip,
    take,
    include: {
      images: {
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { imageUrl: true },
      },
    },
  })

  const isSheetOpen = !!edit || !!showNew
  const closeUrl = q ? `/admin/products?q=${q}` : "/admin/products"
  const formAction = editItem ? updateProduct.bind(null, editItem.id) : createProduct

  return (
    <div className="app-page">
      <PageHeader
        title="Products"
        description={
          <span>
            {totalCount} product{totalCount !== 1 ? "s" : ""}
            {q ? ` matching "${q}"` : ""}
          </span>
        }
        action={
          <>
            <ExcelImportDialog
              entityLabel="Products"
              templateHref="/api/admin/templates/products"
              previewAction={previewProductsExcel}
              commitAction={commitProductsExcel}
            />
            <Button variant="outline" asChild>
              <Link href="/api/admin/templates/products" prefetch={false}>
                <Download className="mr-2 size-4" /> Download Products Template
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/admin/products?new=true${q ? `&q=${q}` : ""}`}>
                <Plus className="mr-2 size-4" /> New product
              </Link>
            </Button>
          </>
        }
      />

      {/* Search */}
      <form method="GET" className="filter-bar">
        <input type="hidden" name="pageSize" value={pageSize} />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name, SKU, category…"
          className="min-w-0 flex-1 sm:max-w-80"
        />
        <Button type="submit" variant="outline" size="default">
          Search
        </Button>
        {q && (
          <Button variant="ghost" asChild>
            <Link href="/admin/products">Clear</Link>
          </Button>
        )}
      </form>

      {/* Table / Empty state */}
      {totalCount === 0 ? (
        q ? (
          <EmptyState
            icon={Box}
            title="No products found"
            description={`No products matched your search filter "${q}". Try clearing the search query.`}
            action={
              <Button variant="outline" asChild>
                <Link href="/admin/products">Clear Search</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Box}
            title="No products yet"
            description="Create your first skincare product to catalog your treatments."
            action={
              <Button asChild>
                <Link href="/admin/products?new=true">
                  <Plus className="mr-2 size-4" /> New product
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="data-table-shell">
          <div className="w-full overflow-x-auto">
            <table className="data-table min-w-[860px]">
              <thead>
                <tr>
                  <th className="w-12" aria-label="Thumbnail" />
                  <th className="min-w-60">
                    Name
                  </th>
                  <th className="w-40">
                    SKU
                  </th>
                  <th className="w-36">
                    Step Type
                  </th>
                  <th className="min-w-40">
                    Category
                  </th>
                  <th className="w-28">
                    Status
                  </th>
                  <th className="w-36 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className="transition-colors"
                  >
                    <td>
                      {p.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.images[0].imageUrl}
                          alt=""
                          className="size-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="size-10 rounded-lg bg-muted" aria-hidden />
                      )}
                    </td>
                    <td className="font-medium whitespace-normal">
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="hover:underline"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {p.sku ?? "—"}
                    </td>
                    <td>
                      <Badge variant="secondary">{p.stepType}</Badge>
                    </td>
                    <td className="text-muted-foreground whitespace-normal">
                      {p.category ?? "—"}
                    </td>
                    <td>
                      <StatusBadge status={p.active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td className="text-right">
                      <div className="table-actions">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" asChild aria-label="Manage product details">
                              <Link href={`/admin/products/${p.id}`}>
                                <Eye className="size-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Manage product details (Images, Replacement Rules)</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" asChild aria-label="Edit Product Attributes">
                              <Link href={`/admin/products?edit=${p.id}${q ? `&q=${q}` : ""}`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit Product Info</TooltipContent>
                        </Tooltip>

                        <AlertDialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={
                                      p.active
                                        ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        : "text-success-foreground hover:bg-success"
                                    }
                                    aria-label={p.active ? "Deactivate Product" : "Activate Product"}
                                  >
                                    {p.active ? <Ban className="size-4" /> : <CheckCircle className="size-4" />}
                                  </Button>
                                </AlertDialogTrigger>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{p.active ? "Deactivate" : "Activate"}</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {p.active ? "Deactivate Product" : "Activate Product"}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to {p.active ? "deactivate" : "activate"} &quot;{p.name}&quot;?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <ToggleActiveForm action={toggleProductActive} id={p.id} isActive={p.active} />
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalCount > 0 && (
        <DataPagination
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          from={from}
          to={to}
          totalCount={totalCount}
        />
      )}

      <AdminFormSheet
        open={isSheetOpen}
        title={editItem ? "Edit Product" : "New Product"}
        description={editItem ? `Update details for "${editItem.name}"` : "Create a new skincare product description."}
        closeUrl={closeUrl}
        className="w-full sm:max-w-xl md:max-w-2xl"
      >
        <ProductForm
          key={editItem?.id ?? "new"}
          action={formAction}
          defaultValues={editItem ?? undefined}
        />
      </AdminFormSheet>
    </div>
  )
}
