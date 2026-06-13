import { requireAuth } from "@/lib/auth-helpers"
import LogoutButton from "@/components/auth/logout-button"
import Link from "next/link"
import { Home, QrCode, ScanLine } from "lucide-react"

export default async function SellerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/seller" className="flex items-center gap-2.5 font-semibold">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground">
              <QrCode className="size-4" />
            </span>
            AOMI Kit
          </Link>
          <nav aria-label="Seller navigation" className="flex items-center gap-1">
            <Link href="/seller" className="flex items-center gap-2 rounded-full px-3 py-2 text-sm hover:bg-sidebar-accent">
              <Home className="size-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
            <Link href="/seller/assign" className="flex items-center gap-2 rounded-full px-3 py-2 text-sm hover:bg-sidebar-accent">
              <ScanLine className="size-4" />
              <span className="hidden sm:inline">Assign</span>
            </Link>
          </nav>
          <div className="flex min-w-0 items-center gap-2 text-sidebar-foreground/65">
            <span className="hidden max-w-48 truncate text-xs lg:block">
            {session.user.email}
            </span>
            <div className="w-10 sm:w-auto">
              <LogoutButton compact />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  )
}
