"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface AdminFormSheetProps {
  open: boolean
  title: string
  description: string
  closeUrl: string
  children: React.ReactNode
  className?: string
}

export function AdminFormSheet({ open, title, description, closeUrl, children, className }: AdminFormSheetProps) {
  const router = useRouter()

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      router.push(closeUrl)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className={cn("flex h-full w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-l border-border p-0 sm:w-full", className)}>
        <SheetHeader className="shrink-0 border-b border-border/70 bg-card px-6 py-5 pr-16">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          <SheetDescription className="text-sm">{description}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
