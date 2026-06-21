import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Pencil, Ban, CheckCircle, Plus, Activity, Download } from "lucide-react"
import { ExcelImportDialog } from "@/components/admin/excel-import-dialog"
import { previewDiagnosesExcel, commitDiagnosesExcel } from "./import-actions"
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
import {
  createDiagnosis,
  updateDiagnosis,
  toggleDiagnosisActive,
} from "./actions"
import { ToggleActiveForm } from "@/components/admin/toggle-active-form"
import DiagnosisForm from "./_components/diagnosis-form"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"
import type { Prisma } from "@/generated/prisma/client"
import { DataPagination } from "@/components/ui/data-pagination"
import { resolvePagination } from "@/lib/pagination"

export const metadata = { title: "Diagnoses — AOMI Kit Admin" }

export default async function DiagnosesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; edit?: string; new?: string; page?: string; pageSize?: string }>
}) {
  await requireRole("ADMIN")
  const { q, edit, new: showNew, page: pageParam, pageSize: pageSizeParam } = await searchParams

  const where: Prisma.DiagnosisWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      }
    : {}

  const [totalCount, editItem] = await Promise.all([
    prisma.diagnosis.count({ where }),
    edit ? prisma.diagnosis.findUnique({ where: { id: edit } }) : null,
  ])

  const { page, pageSize, totalPages, skip, take, from, to } = resolvePagination({
    page: pageParam,
    pageSize: pageSizeParam,
    totalCount,
  })

  const diagnoses = await prisma.diagnosis.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip,
    take,
  })

  const updateAction = editItem
    ? updateDiagnosis.bind(null, editItem.id)
    : null

  const isSheetOpen = !!edit || !!showNew
  const closeUrl = q ? `/admin/diagnoses?q=${q}` : "/admin/diagnoses"

  return (
    <div className="app-page">
      <PageHeader
        title="Diagnoses"
        description={
          <span>
            {totalCount} skin diagnosis profile{totalCount !== 1 ? "s" : ""}
            {q ? ` matching "${q}"` : ""}
          </span>
        }
        action={
          <>
            <ExcelImportDialog
              entityLabel="Diagnoses"
              templateHref="/api/admin/templates/diagnoses"
              previewAction={previewDiagnosesExcel}
              commitAction={commitDiagnosesExcel}
            />
            <Button variant="outline" asChild>
              <Link href="/api/admin/templates/diagnoses" prefetch={false}>
                <Download className="mr-2 size-4" /> Download Diagnoses Template
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/admin/diagnoses?new=true${q ? `&q=${q}` : ""}`}>
                <Plus className="mr-2 size-4" /> New diagnosis
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
          placeholder="Search by name or slug…"
          className="min-w-0 flex-1 sm:max-w-80"
        />
        <Button type="submit" variant="outline" size="default">
          Search
        </Button>
        {q && (
          <Button variant="ghost" asChild>
            <Link href="/admin/diagnoses">Clear</Link>
          </Button>
        )}
      </form>

      {/* Table / Empty state */}
      {totalCount === 0 ? (
        q ? (
          <EmptyState
            icon={Activity}
            title="No diagnoses found"
            description={`No diagnosis profiles matched your search filter "${q}". Try clearing the search query.`}
            action={
              <Button variant="outline" asChild>
                <Link href="/admin/diagnoses">Clear Search</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Activity}
            title="No diagnoses yet"
            description="Create your first skin diagnosis profile to link with customized treatment routines."
            action={
              <Button asChild>
                <Link href="/admin/diagnoses?new=true">
                  <Plus className="mr-2 size-4" /> New diagnosis
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="data-table-shell">
          <div className="w-full overflow-x-auto">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th className="min-w-48">
                    Name
                  </th>
                  <th className="min-w-48">
                    Slug
                  </th>
                  <th className="min-w-72">
                    Description
                  </th>
                  <th className="w-28">
                    Status
                  </th>
                  <th className="w-28 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {diagnoses.map((d) => (
                  <tr
                    key={d.id}
                    className="transition-colors"
                  >
                    <td className="font-medium whitespace-normal">
                      {d.name}
                    </td>
                    <td className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {d.slug}
                    </td>
                    <td className="max-w-sm whitespace-normal text-muted-foreground">
                      {d.description ?? "—"}
                    </td>
                    <td>
                      <StatusBadge status={d.active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td className="text-right">
                      <div className="table-actions">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" asChild aria-label="Edit Diagnosis">
                              <Link href={`/admin/diagnoses?edit=${d.id}${q ? `&q=${q}` : ""}`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit Diagnosis</TooltipContent>
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
                                      d.active
                                        ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        : "text-success-foreground hover:bg-success"
                                    }
                                    aria-label={d.active ? "Deactivate Diagnosis" : "Activate Diagnosis"}
                                  >
                                    {d.active ? <Ban className="size-4" /> : <CheckCircle className="size-4" />}
                                  </Button>
                                </AlertDialogTrigger>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{d.active ? "Deactivate" : "Activate"}</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {d.active ? "Deactivate Diagnosis" : "Activate Diagnosis"}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to {d.active ? "deactivate" : "activate"} &quot;{d.name}&quot;?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <ToggleActiveForm action={toggleDiagnosisActive} id={d.id} isActive={d.active} />
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
        title={editItem ? "Edit Diagnosis" : "New Diagnosis"}
        description={editItem ? `Update details for "${editItem.name}"` : "Create a new skin diagnosis profile."}
        closeUrl={closeUrl}
        className="w-full sm:max-w-md"
      >
        <DiagnosisForm
          key={editItem?.id ?? "new"}
          action={updateAction ?? createDiagnosis}
          editItem={editItem ?? undefined}
        />
      </AdminFormSheet>
    </div>
  )
}
