import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Pencil, Ban, CheckCircle, Plus, Layout } from "lucide-react"
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
  createRoutineType,
  updateRoutineType,
  toggleRoutineTypeActive,
} from "./actions"
import RoutineTypeForm from "./_components/routine-type-form"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"

export const metadata = { title: "Routine Types — AOMI Kit Admin" }

export default async function RoutineTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; edit?: string; new?: string }>
}) {
  await requireRole("ADMIN")
  const { q, edit, new: showNew } = await searchParams

  const routineTypes = await prisma.routineType.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    include: { _count: { select: { templates: true } } },
  })

  const editItem = edit
    ? await prisma.routineType.findUnique({ where: { id: edit } })
    : null

  const updateAction = editItem
    ? updateRoutineType.bind(null, editItem.id)
    : null

  const isSheetOpen = !!edit || !!showNew
  const closeUrl = q ? `/admin/routine-types?q=${q}` : "/admin/routine-types"

  return (
    <div className="app-page">
      <PageHeader
        title="Routine Types"
        description={
          <span>
            {routineTypes.length} routine classification type{routineTypes.length !== 1 ? "s" : ""}
            {q ? ` matching "${q}"` : ""}
          </span>
        }
        action={
          <Button asChild>
            <Link href={`/admin/routine-types?new=true${q ? `&q=${q}` : ""}`}>
              <Plus className="mr-2 size-4" /> New routine type
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
            <Link href="/admin/routine-types">Clear</Link>
          </Button>
        )}
      </form>

      {/* Table / Empty state */}
      {routineTypes.length === 0 ? (
        q ? (
          <EmptyState
            icon={Layout}
            title="No routine types found"
            description={`No routine types matched your search filter "${q}". Try clearing the search query.`}
            action={
              <Button variant="outline" asChild>
                <Link href="/admin/routine-types">Clear Search</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Layout}
            title="No routine types yet"
            description="Create your first routine type classification (e.g. Morning, Evening, Weekly Treatment)."
            action={
              <Button asChild>
                <Link href="/admin/routine-types?new=true">
                  <Plus className="mr-2 size-4" /> New routine type
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="data-table-shell">
          <div className="w-full overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th className="min-w-52">
                    Name
                  </th>
                  <th className="min-w-52">
                    Slug
                  </th>
                  <th className="w-24 text-center">
                    Templates
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
                {routineTypes.map((rt) => (
                  <tr
                    key={rt.id}
                    className="transition-colors"
                  >
                    <td className="font-medium whitespace-normal">
                      {rt.name}
                    </td>
                    <td className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {rt.slug}
                    </td>
                    <td className="text-center text-muted-foreground">
                      {rt._count.templates}
                    </td>
                    <td>
                      <StatusBadge status={rt.active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td className="text-right">
                      <div className="table-actions">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" asChild aria-label="Edit Routine Type">
                              <Link href={`/admin/routine-types?edit=${rt.id}${q ? `&q=${q}` : ""}`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit Routine Type</TooltipContent>
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
                                      rt.active
                                        ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        : "text-success-foreground hover:bg-success"
                                    }
                                    aria-label={rt.active ? "Deactivate Routine Type" : "Activate Routine Type"}
                                  >
                                    {rt.active ? <Ban className="size-4" /> : <CheckCircle className="size-4" />}
                                  </Button>
                                </AlertDialogTrigger>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{rt.active ? "Deactivate" : "Activate"}</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {rt.active ? "Deactivate Routine Type" : "Activate Routine Type"}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to {rt.active ? "deactivate" : "activate"} &quot;{rt.name}&quot;?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <form action={toggleRoutineTypeActive}>
                                <input type="hidden" name="id" value={rt.id} />
                                <AlertDialogAction type="submit" variant={rt.active ? "destructive" : "default"}>
                                  {rt.active ? "Deactivate" : "Activate"}
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
        title={editItem ? "Edit Routine Type" : "New Routine Type"}
        description={editItem ? `Update details for "${editItem.name}"` : "Create a new skin routine classification type."}
        closeUrl={closeUrl}
        className="w-full sm:max-w-md"
      >
        <RoutineTypeForm
          key={editItem?.id ?? "new"}
          action={updateAction ?? createRoutineType}
          editItem={editItem ?? undefined}
        />
      </AdminFormSheet>
    </div>
  )
}
