import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { updateRoutine, toggleRoutineActive } from "../actions"
import RoutineForm from "../_components/routine-form"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const routine = await prisma.routineTemplate.findUnique({
    where: { id },
    select: { name: true },
  })
  return { title: routine ? `${routine.name} — AOMI Kit Admin` : "Routine" }
}

export default async function EditRoutinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole("ADMIN")
  const { id } = await params

  const routine = await prisma.routineTemplate.findUnique({
    where: { id },
    include: {
      diagnoses: { select: { diagnosisId: true } },
      steps: { orderBy: { stepNumber: "asc" } },
    },
  })
  if (!routine) notFound()

  const [routineTypes, diagnoses, products] = await Promise.all([
    prisma.routineType.findMany({
      where: { OR: [{ active: true }, { id: routine.routineTypeId }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.diagnosis.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ stepType: "asc" }, { name: "asc" }],
      select: { id: true, name: true, stepType: true },
    }),
  ])

  // Include any selected (possibly inactive) diagnoses in the list so they
  // stay visible/selected.
  const selectedIds = new Set(routine.diagnoses.map((d) => d.diagnosisId))
  const diagnosisOptions = diagnoses
    .filter((d) => d.active || selectedIds.has(d.id))
    .map((d) => ({ id: d.id, name: d.name }))

  const action = updateRoutine.bind(null, id)

  const defaults = {
    name: routine.name,
    description: routine.description,
    routineTypeId: routine.routineTypeId,
    durationDays: routine.durationDays,
    generalInstructions: routine.generalInstructions,
    active: routine.active,
    diagnosisIds: routine.diagnoses.map((d) => d.diagnosisId),
    steps: routine.steps.map((s) => ({
      stepType: s.stepType,
      defaultProductId: s.defaultProductId,
      instruction: s.instruction,
    })),
  }

  return (
    <div className="app-page">
      <PageHeader
        title={routine.name}
        description={
          <div className="space-y-2">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            <Link href="/admin/routines" className="hover:underline">
              Routines
            </Link>
            {" / "}
            <span>{routine.name}</span>
          </nav>
          <StatusBadge status={routine.active ? "ACTIVE" : "INACTIVE"} />
          </div>
        }
        action={
        <form action={toggleRoutineActive}>
          <input type="hidden" name="id" value={routine.id} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className={
              routine.active
                ? "border-destructive/25 text-destructive hover:bg-destructive/10"
                : "border-success text-success-foreground hover:bg-success"
            }
          >
            {routine.active ? "Deactivate" : "Activate"}
          </Button>
        </form>
        }
      />

      <Card>
        <CardContent>
        <RoutineForm
          action={action}
          routineTypes={routineTypes}
          diagnoses={diagnosisOptions}
          products={products}
          defaults={defaults}
          submitLabel="Save changes"
        />
        </CardContent>
      </Card>
    </div>
  )
}
