import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import VoidTokenButton from "./_components/void-token-button"
import type { Prisma, QRTokenStatus } from "@/generated/prisma/client"
import {
  Plus,
  Download,
  Eye,
  Activity,
  FileSpreadsheet,
  Layers,
  CheckCircle,
  HelpCircle,
  FileText,
  QrCode,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Card, CardContent } from "@/components/ui/card"
import { AdminFormSheet } from "@/components/ui/admin-form-sheet"
import { SheetFooter } from "@/components/ui/sheet"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import GenerateForm from "./generate/_generate-form"
import ImportForm from "./import/_import-form"
import { PageSizeSelector } from "./_components/page-size-selector"
import { QrTokenFilters } from "./_components/qr-token-filters"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { StatusBadge } from "@/components/ui/status-badge"

export const metadata = { title: "QR Tokens — AOMI Kit Admin" }

const STATUSES: QRTokenStatus[] = [
  "AVAILABLE",
  "ASSIGNED",
  "ACTIVATED",
  "VOIDED",
  "REPLACED",
]

function getPaginationRange(current: number, total: number) {
  const pages: (number | string)[] = []
  const showMax = 5
  if (total <= showMax) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    if (current > 3) {
      pages.push("...")
    }
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    if (current < total - 2) {
      pages.push("...")
    }
    pages.push(total)
  }
  return pages
}

export default async function QrTokensPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    batch?: string
    q?: string
    page?: string
    pageSize?: string
    generate?: string
    import?: string
    tokenDetails?: string
  }>
}) {
  await requireRole("ADMIN")
  const sp = await searchParams

  // Setup filters
  const where: Prisma.QRTokenWhereInput = {}
  if (sp.status && STATUSES.includes(sp.status as QRTokenStatus)) {
    where.status = sp.status as QRTokenStatus
  }
  if (sp.batch) where.batchId = sp.batch
  if (sp.q) where.token = { contains: sp.q.toUpperCase() }

  // Clamp rows per page selector values
  const allowedSizes = [50, 100, 500, 1000]
  const pageSize = allowedSizes.includes(Number(sp.pageSize))
    ? Number(sp.pageSize)
    : 50

  // Phase 1: run count, batch list, global status counts, and token details in
  // parallel. Only the page-list query (tokens) must wait — it depends on the
  // clamped page value derived from totalCount. Batches, statsGroup, and
  // detailedToken are independent of both totalCount and each other.
  const [totalCount, batches, statsGroup, detailedToken] = await Promise.all([
    prisma.qRToken.count({ where }),
    prisma.qRTokenBatch.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, batchName: true, createdAt: true },
      take: 100,
    }),
    prisma.qRToken.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    sp.tokenDetails
      ? prisma.qRToken.findUnique({
          where: { id: sp.tokenDetails },
          include: {
            batch: true,
            package: {
              include: {
                template: {
                  select: { name: true },
                },
              },
            },
            events: {
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : null,
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Clamp page value now that totalCount is known.
  let page = Math.max(1, Number(sp.page) || 1)
  if (page > totalPages) {
    page = totalPages
  }

  // Phase 2: fetch the page of tokens (depends on clamped page from Phase 1).
  const tokens = await prisma.qRToken.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize,
    skip: (page - 1) * pageSize,
    select: {
      id: true,
      token: true,
      status: true,
      batchId: true,
      createdAt: true,
      batch: {
        select: {
          batchName: true,
        },
      },
    },
  })

  // Process statistics mapping
  const stats = {
    AVAILABLE: 0,
    ASSIGNED: 0,
    ACTIVATED: 0,
    VOIDED: 0,
    REPLACED: 0,
    TOTAL: 0,
  }
  let computedTotal = 0
  for (const g of statsGroup) {
    const status = g.status as keyof typeof stats
    const count = g._count._all
    if (status in stats) {
      stats[status] = count
      computedTotal += count
    }
  }
  stats.TOTAL = computedTotal

  // Determine Primary Card text
  let primaryCardTitle = "Total QR Codes"
  let primaryCardSubtitle = ""
  
  const activeBatchName = sp.batch ? (batches.find(b => b.id === sp.batch)?.batchName ?? sp.batch.slice(0, 8)) : ""

  if (sp.q) {
    primaryCardTitle = "Matching QR Codes"
    primaryCardSubtitle = "Filtered by active search" + (sp.batch ? ` in ${activeBatchName}` : "")
  } else if (sp.batch && sp.status) {
    primaryCardTitle = "Matching QR Codes"
    primaryCardSubtitle = `${sp.status} in ${activeBatchName}`
  } else if (sp.batch) {
    primaryCardTitle = "QR Codes in Batch"
    primaryCardSubtitle = activeBatchName
  } else if (sp.status) {
    const capitalizedStatus = sp.status.charAt(0).toUpperCase() + sp.status.slice(1).toLowerCase()
    primaryCardTitle = `${capitalizedStatus} QR Codes`
  }

  // Build pagination links builder
  const getPageUrl = (targetPage: number) => {
    const params = new URLSearchParams()
    if (sp.q) params.set("q", sp.q)
    if (sp.status) params.set("status", sp.status)
    if (sp.batch) params.set("batch", sp.batch)
    params.set("pageSize", String(pageSize))
    params.set("page", String(targetPage))
    return `/admin/qr-tokens?${params.toString()}`
  }

  // Build export query string
  const exportQs = new URLSearchParams()
  if (sp.status) exportQs.set("status", sp.status)
  if (sp.batch) exportQs.set("batch", sp.batch)

  const isGenerateSheetOpen = sp.generate === "true"
  const isImportSheetOpen = sp.import === "true"
  const isDetailsSheetOpen = !!sp.tokenDetails

  // Re-build query parameters for Sheet close actions (maintains page and filters)
  const sheetCloseQs = new URLSearchParams()
  if (sp.q) sheetCloseQs.set("q", sp.q)
  if (sp.status) sheetCloseQs.set("status", sp.status)
  if (sp.batch) sheetCloseQs.set("batch", sp.batch)
  sheetCloseQs.set("page", String(page))
  sheetCloseQs.set("pageSize", String(pageSize))
  const sheetCloseUrl = `/admin/qr-tokens?${sheetCloseQs.toString()}`

  return (
    <div className="app-page">
      <PageHeader
        title="QR Tokens"
        description="Manage product tokens, import logs, and activation lifecycles"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/admin/qr-tokens/export?${exportQs.toString()}`}>
                <Download className="mr-2 size-4" /> Export CSV
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/admin/qr-tokens?import=true&${sheetCloseQs.toString()}`}>
                <FileSpreadsheet className="mr-2 size-4" /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/admin/qr-tokens?generate=true&${sheetCloseQs.toString()}`}>
                <Plus className="mr-2 size-4" /> Generate
              </Link>
            </Button>
          </div>
        }
      />

      {/* Prominent Statistics Grid — always visible above filter controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <Card className="kpi-card bg-primary text-primary-foreground">
          <CardContent>
            <div className="min-w-0 flex-1 space-y-1">
              <span className="kpi-label text-primary-foreground/75">{primaryCardTitle}</span>
              <p className="kpi-value">{totalCount}</p>
              {primaryCardSubtitle && (
                <p className="kpi-caption truncate text-primary-foreground/65" title={primaryCardSubtitle}>{primaryCardSubtitle}</p>
              )}
            </div>
            <Layers className="mt-1 size-6 shrink-0 text-primary-foreground/70" />
          </CardContent>
        </Card>

        <Card className="kpi-card bg-success text-success-foreground">
          <CardContent>
            <div className="space-y-1">
              <span className="kpi-label">Available</span>
              <p className="kpi-value">{stats.AVAILABLE}</p>
              <p className="kpi-caption">Across all batches</p>
            </div>
            <HelpCircle className="mt-1 size-6 shrink-0 opacity-60" />
          </CardContent>
        </Card>

        <Card className="kpi-card bg-warning text-warning-foreground">
          <CardContent>
            <div className="space-y-1">
              <span className="kpi-label">Assigned</span>
              <p className="kpi-value">{stats.ASSIGNED}</p>
              <p className="kpi-caption">Across all batches</p>
            </div>
            <FileText className="mt-1 size-6 shrink-0 opacity-60" />
          </CardContent>
        </Card>

        <Card className="kpi-card bg-success-foreground text-success">
          <CardContent>
            <div className="space-y-1">
              <span className="kpi-label">Activated</span>
              <p className="kpi-value">{stats.ACTIVATED}</p>
              <p className="kpi-caption">Across all batches</p>
            </div>
            <CheckCircle className="mt-1 size-6 shrink-0 opacity-60" />
          </CardContent>
        </Card>

        <Card className="kpi-card bg-destructive/8 text-destructive">
          <CardContent>
            <div className="space-y-1">
              <span className="kpi-label">Voided</span>
              <p className="kpi-value">{stats.VOIDED}</p>
              <p className="kpi-caption">Across all batches</p>
            </div>
            <Activity className="mt-1 size-6 shrink-0 opacity-65" />
          </CardContent>
        </Card>
      </div>

      <QrTokenFilters key={sp.q ?? ""} batches={batches} statuses={STATUSES}>

        {/* Table / Empty state */}
        {tokens.length === 0 ? (
          (sp.q || sp.status || sp.batch) ? (
            <EmptyState
              icon={QrCode}
              title="No tokens found"
              description="No QR tokens matched your active search or filter inputs."
              action={
                <Button variant="outline" asChild>
                  <Link href="/admin/qr-tokens">Clear Filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={QrCode}
              title="No tokens generated yet"
              description="Generate a new batch of codes or import pre-existing codes to get started."
              action={
                <div className="flex gap-2">
                  <Button variant="outline" asChild>
                    <Link href={`/admin/qr-tokens?import=true&${sheetCloseQs.toString()}`}>
                      <FileSpreadsheet className="mr-2 size-4" /> Import Tokens
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link href={`/admin/qr-tokens?generate=true&${sheetCloseQs.toString()}`}>
                      <Plus className="mr-2 size-4" /> Generate Tokens
                    </Link>
                  </Button>
                </div>
              }
            />
          )
        ) : (
          <div className="data-table-shell">
            <div className="w-full overflow-x-auto">
              <table className="data-table min-w-[880px]">
                <thead>
                  <tr>
                    <th className="min-w-80">
                      Token
                    </th>
                    <th className="w-32">
                      Status
                    </th>
                    <th className="min-w-48">
                      Batch
                    </th>
                    <th className="w-32">
                      Created
                    </th>
                    <th className="w-24 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr
                      key={t.id}
                      className="transition-colors"
                    >
                      <td className="max-w-sm whitespace-normal break-all font-mono text-xs font-semibold">
                        <Link
                          href={`/admin/qr-tokens?tokenDetails=${t.id}&${sheetCloseQs.toString()}`}
                          className="hover:underline cursor-pointer"
                        >
                          {t.token}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="whitespace-normal text-muted-foreground">
                        {t.batch?.batchName ?? (t.batchId ? t.batchId.slice(0, 8) : "—")}
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap">
                        {t.createdAt.toISOString().slice(0, 10)}
                      </td>
                      <td className="text-right">
                        <div className="table-actions">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" asChild aria-label="View Token Details">
                                <Link href={`/admin/qr-tokens?tokenDetails=${t.id}&${sheetCloseQs.toString()}`}>
                                  <Eye className="size-4" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Token Details</TooltipContent>
                          </Tooltip>

                          {(t.status === "AVAILABLE" || t.status === "ASSIGNED") && (
                            <VoidTokenButton id={t.id} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-col gap-4 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
            </span>
            <PageSizeSelector currentSize={pageSize} />
          </div>

          {totalPages > 1 && (
            <Pagination className="w-auto mx-0">
              <PaginationContent>
                <PaginationItem>
                  {page > 1 ? (
                    <PaginationPrevious href={getPageUrl(page - 1)} />
                  ) : (
                    <Button variant="ghost" size="default" disabled className="pl-1.5! opacity-50 cursor-not-allowed">
                      Previous
                    </Button>
                  )}
                </PaginationItem>

                {getPaginationRange(page, totalPages).map((p, index) => (
                  <PaginationItem key={index}>
                    {p === "..." ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        href={getPageUrl(Number(p))}
                        isActive={p === page}
                      >
                        {p}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}

                <PaginationItem>
                  {page < totalPages ? (
                    <PaginationNext href={getPageUrl(page + 1)} />
                  ) : (
                    <Button variant="ghost" size="default" disabled className="pr-1.5! opacity-50 cursor-not-allowed">
                      Next
                    </Button>
                  )}
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </QrTokenFilters>

      {/* Generate Tokens Sheet */}
      <AdminFormSheet
        open={isGenerateSheetOpen}
        title="Generate Token Batch"
        description="Creates a new batch of AVAILABLE codes with the specified quantity and prefix."
        closeUrl={sheetCloseUrl}
        className="w-full sm:max-w-lg"
      >
        <GenerateForm key={isGenerateSheetOpen ? "generate-open" : "generate-closed"} />
      </AdminFormSheet>

      {/* Import Tokens Sheet */}
      <AdminFormSheet
        open={isImportSheetOpen}
        title="Import Tokens"
        description="Provide a CSV file or paste token codes directly. Duplicates and invalid formats will be ignored."
        closeUrl={sheetCloseUrl}
        className="w-full sm:max-w-lg"
      >
        <ImportForm key={isImportSheetOpen ? "import-open" : "import-closed"} />
      </AdminFormSheet>

      {/* Token Details Sheet */}
      <AdminFormSheet
        open={isDetailsSheetOpen}
        title="Token Detailed Info"
        description="Audit trace and state indicators for this token."
        closeUrl={sheetCloseUrl}
        className="w-full sm:max-w-2xl lg:max-w-3xl"
      >
        {detailedToken && (
          <div className="flex flex-1 flex-col min-h-0">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* Token Code Header */}
              <div className="form-section">
                <span className="section-label">Token Code</span>
                <div className="select-all rounded-2xl bg-background p-3 font-mono text-xl font-bold tracking-wider ring-1 ring-border">
                  {detailedToken.token}
                </div>
              </div>

              {/* Status & Created Date grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="form-section">
                  <span className="section-label">Lifecycle Status</span>
                  <div className="pt-1">
                    <StatusBadge status={detailedToken.status} />
                  </div>
                </div>
                <div className="form-section">
                  <span className="section-label">Created At</span>
                  <div className="text-sm font-semibold">
                    {new Date(detailedToken.createdAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
              </div>

              {/* Batch Origin details Card */}
              <div className="form-section">
                <h4 className="section-label border-b border-border pb-2">Batch Origin</h4>
                {detailedToken.batch ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Batch Name</dt>
                      <dd className="mt-0.5 font-semibold">{detailedToken.batch.batchName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Prefix</dt>
                      <dd className="mt-0.5 font-mono font-semibold">{detailedToken.batch.prefix}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Source</dt>
                      <dd className="mt-0.5 font-semibold">{detailedToken.batch.source}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Batch ID</dt>
                      <dd className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={detailedToken.batch.id}>{detailedToken.batch.id}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-xs italic text-muted-foreground">Independent token (no batch origin).</p>
                )}
              </div>

              {/* Package assignment details Card */}
              <div className="form-section">
                <h4 className="section-label border-b border-border pb-2">Routine Assignment</h4>
                {detailedToken.package ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div className="col-span-2">
                      <dt className="text-xs font-medium text-muted-foreground">Active Routine Template</dt>
                      <dd className="mt-0.5 font-bold">{detailedToken.package.template?.name ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Package Status</dt>
                      <dd className="mt-0.5 font-semibold">{detailedToken.package.status}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Assigned Date</dt>
                      <dd className="mt-0.5 font-semibold">
                        {new Date(detailedToken.package.createdAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-xs italic text-muted-foreground">Not assigned yet.</p>
                )}
              </div>

              {/* Events Logs audit history */}
              <div className="form-section">
                <h4 className="section-label border-b border-border pb-2">Audit Scan History</h4>
                {detailedToken.events && detailedToken.events.length > 0 ? (
                  <div className="space-y-3 max-h-40 overflow-y-auto pr-1">
                    {detailedToken.events.map((ev) => (
                      <div key={ev.id} className="space-y-1 rounded-2xl border border-border bg-background p-3 text-xs">
                        <div className="flex justify-between font-semibold">
                          <span>{ev.eventType}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(ev.createdAt).toLocaleString("en-US", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>
                        {ev.externalUserId && (
                          <p className="text-[11px] text-muted-foreground">External User: <span className="select-all rounded border bg-card px-1 py-0.5 font-mono text-[10px]">{ev.externalUserId}</span></p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">No scans recorded.</p>
                )}
              </div>

              {/* Danger Zone */}
              {(detailedToken.status === "AVAILABLE" || detailedToken.status === "ASSIGNED") && (
                <div className="space-y-3 rounded-3xl border border-destructive/25 bg-destructive/5 p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-destructive">Danger Zone</h4>
                    <p className="text-xs text-destructive/80">Voiding this token is permanent and cannot be undone. Associated packages will lose access.</p>
                  </div>
                  <VoidTokenButton id={detailedToken.id} variant="full" />
                </div>
              )}
            </div>

            <SheetFooter className="shrink-0 border-t bg-background px-6 py-4 flex items-center justify-end">
              <Button variant="outline" size="sm" asChild>
                <Link href={sheetCloseUrl}>Close</Link>
              </Button>
            </SheetFooter>
          </div>
        )}
      </AdminFormSheet>
    </div>
  )
}
