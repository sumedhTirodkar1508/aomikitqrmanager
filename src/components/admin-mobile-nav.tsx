"use client"

import { useState } from "react"
import { Menu, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet"
import { AdminNavLinks } from "./admin-nav"
import LogoutButton from "@/components/auth/logout-button"

interface AdminMobileNavProps {
  email: string
}

export function AdminMobileNav({ email }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground shadow-sm md:hidden">
      <div className="flex items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[19rem] flex-col justify-between bg-sidebar p-4 text-sidebar-foreground">
            <div className="space-y-6">
              <SheetHeader className="border-b border-sidebar-border px-2 pb-5 pt-2 text-left">
                <SheetTitle className="flex items-center gap-3 text-base font-semibold text-sidebar-foreground">
                  <span className="flex size-9 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground">
                    <QrCode className="size-4" />
                  </span>
                  AOMI Kit Admin
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Navigation menu for admin section.
                </SheetDescription>
              </SheetHeader>
              <AdminNavLinks onLinkClick={() => setOpen(false)} />
            </div>
            <div className="space-y-2 border-t border-sidebar-border pt-4">
              <div className="truncate px-3 text-xs text-sidebar-foreground/55">
                {email}
              </div>
              <div className="px-1">
                <LogoutButton />
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <QrCode className="size-4 text-primary" />
          AOMI Kit Admin
        </span>
      </div>
    </header>
  )
}
