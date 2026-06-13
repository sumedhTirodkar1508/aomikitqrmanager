import { requireAnyRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { QrCode, Plus } from "lucide-react"
import { StatusBadge } from "@/components/ui/status-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Seller Panel — AOMI Kit QR Manager" }

export default async function SellerPage() {
  const session = await requireAnyRole("SELLER", "ADMIN")

  const recent = await prisma.package.findMany({
    where: { createdByUserId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      qrToken: { select: { token: true } },
      template: { select: { name: true } },
    },
  })

  return (
    <div className="app-page">
      <PageHeader
        title="Seller Panel"
        description={`Welcome back, ${session.user.name ?? session.user.email}`}
        action={
          <Button asChild>
            <Link href="/seller/assign">
              <Plus className="mr-2 size-4" /> Assign QR Kit
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent assignments</CardTitle>
          <CardDescription>The 10 most recent kits assigned by your account.</CardDescription>
        </CardHeader>
        <CardContent>
        {recent.length === 0 ? (
          <EmptyState
            icon={QrCode}
            title="No assignments yet"
            description="You have not assigned any QR kits to routine templates yet."
            action={
              <Button asChild>
                <Link href="/seller/assign">
                  <Plus className="mr-2 size-4" /> Assign your first kit
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="data-table-shell">
            <div className="w-full overflow-x-auto">
              <table className="data-table min-w-[700px]">
                <thead>
                  <tr>
                    <th className="min-w-64">
                      Token
                    </th>
                    <th className="min-w-56">
                      Routine
                    </th>
                    <th className="w-28">
                      Status
                    </th>
                    <th className="w-32">
                      Assigned
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr
                      key={p.id}
                      className="transition-colors"
                    >
                      <td className="font-mono text-xs font-semibold whitespace-nowrap">
                        {p.qrToken.token}
                      </td>
                      <td className="text-muted-foreground whitespace-normal">
                        {p.template.name}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap">
                        {p.createdAt.toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  )
}
