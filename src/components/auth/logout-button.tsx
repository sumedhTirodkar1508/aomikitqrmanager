"use client"

import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <Button
      variant="ghost"
      onClick={() => signOut({ callbackUrl: "/login" })}
      aria-label={compact ? "Sign out" : undefined}
      className={cn(
        "group w-full justify-start rounded-xl text-current/70 hover:bg-destructive/10 hover:text-destructive",
        compact && "size-9 justify-center px-0"
      )}
    >
      <LogOut
        aria-hidden="true"
        className="size-4 text-destructive transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      />
      {!compact && "Sign out"}
    </Button>
  )
}
