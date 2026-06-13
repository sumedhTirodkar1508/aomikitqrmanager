import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Pencil, Ban, CheckCircle, Plus, Activity } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
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
import DiagnosisForm from "./_components/diagnosis-form"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"

export const metadata = { title: "Diagnoses — AOMI Kit Admin" }

export default async function DiagnosesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; edit?: string; new?: string }>
}) {
  await requireRole("ADMIN")
  const { q, edit, new: showNew } = await searchParams

  const diagnoses = await prisma.diagnosis.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
  })

  const editItem = edit
    ? await prisma.diagnosis.findUnique({ where: { id: edit } })
    : null

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
            {diagnoses.length} skin diagnosis profile{diagnoses.length !== 1 ? "s" : ""}
            {q ? ` matching "${q}"` : ""}
          </span>
        }
        action={
          <Button asChild>
            <Link href={`/admin/diagnoses?new=true${q ? `&q=${q}` : ""}`}>
              <Plus className="mr-2 size-4" /> New diagnosis
            </Link>
          </Button>
        }
      />

      {/* Search */}
      <form method="GET" className="filter-bar">
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
      {diagnoses.length === 0 ? (
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
                              <form action={toggleDiagnosisActive}>
                                <input type="hidden" name="id" value={d.id} />
                                <AlertDialogAction type="submit" variant={d.active ? "destructive" : "default"}>
                                  {d.active ? "Deactivate" : "Activate"}
                                </AlertDialogAction>
                              </form>
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
