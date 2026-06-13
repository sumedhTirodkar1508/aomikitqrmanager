import { requireRole } from "@/lib/auth-helpers"
import { PageHeader } from "@/components/ui/page-header"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Boxes, ClipboardList, QrCode, Shapes, UserRound } from "lucide-react"

export const metadata = { title: "Admin Dashboard — AOMI Kit QR Manager" }

export default async function AdminPage() {
  const session = await requireRole("ADMIN")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${session.user.name ?? session.user.email}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { href: "/admin/products", label: "Products", detail: "Catalog and replacement rules", icon: Boxes },
          { href: "/admin/diagnoses", label: "Diagnoses", detail: "Skin diagnosis profiles", icon: Activity },
          { href: "/admin/routine-types", label: "Routine types", detail: "Routine classifications", icon: Shapes },
          { href: "/admin/routines", label: "Routines", detail: "Treatment templates and steps", icon: ClipboardList },
          { href: "/admin/qr-tokens", label: "QR tokens", detail: "Generate, import, and monitor", icon: QrCode },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className="group">
              <Card className="h-full transition-transform duration-200 group-hover:-translate-y-0.5">
                <CardHeader>
                  <span className="icon-tile mb-3"><Icon className="size-5" /></span>
                  <CardTitle>{item.label}</CardTitle>
                  <CardDescription>{item.detail}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="icon-tile"><UserRound className="size-5" /></span>
            <div>
              <CardTitle>Current session</CardTitle>
              <CardDescription>Your authenticated admin identity.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Name</dt><dd className="mt-1 font-medium">{session.user.name ?? "Not provided"}</dd></div>
            <div><dt className="text-muted-foreground">Email</dt><dd className="mt-1 font-medium">{session.user.email}</dd></div>
            <div><dt className="text-muted-foreground">Role</dt><dd className="mt-1"><Badge>{session.user.role}</Badge></dd></div>
            <div><dt className="text-muted-foreground">User ID</dt><dd className="mt-1 truncate font-mono text-xs">{session.user.id}</dd></div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
