"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Activity,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  QrCode,
  Shapes,
} from "lucide-react"

interface AdminNavLinksProps {
  onLinkClick?: () => void
}

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Boxes },
  { href: "/admin/diagnoses", label: "Diagnoses", icon: Activity },
  { href: "/admin/routine-types", label: "Routine Types", icon: Shapes },
  { href: "/admin/routines", label: "Routines", icon: ClipboardList },
  { href: "/admin/qr-tokens", label: "QR Tokens", icon: QrCode },
]

export function AdminNavLinks({ onLinkClick }: AdminNavLinksProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = item.href === "/admin"
          ? pathname === "/admin"
          : pathname.startsWith(item.href)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onLinkClick}
            className={cn(
              "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all active:scale-[0.98]",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "size-4",
                isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/45 group-hover:text-sidebar-accent-foreground"
              )}
            />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
