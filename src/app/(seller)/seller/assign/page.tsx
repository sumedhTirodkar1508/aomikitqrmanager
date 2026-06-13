import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import AssignFlow from "./_components/assign-flow"
import { PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Assign QR Kit — AOMI Kit" }

export default async function AssignPage() {
  await requireAuth()

  const diagnoses = await prisma.diagnosis.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Assign QR Kit"
        description={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/seller" className="hover:underline">
              Seller
            </Link>
            <span>/</span>
            <span>Assign Kit</span>
          </nav>
        }
      />

      <AssignFlow diagnoses={diagnoses} />
    </div>
  )
}
