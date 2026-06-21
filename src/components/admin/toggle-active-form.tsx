"use client"

import { toast } from "sonner"
import { AlertDialogAction } from "@/components/ui/alert-dialog"

export function ToggleActiveForm({
  action,
  id,
  isActive,
}: {
  action: (fd: FormData) => Promise<{ error?: string; ok?: boolean } | void>
  id: string
  isActive: boolean
}) {
  return (
    <form
      action={async (fd) => {
        const res = await action(fd)
        if (res?.error) toast.error(res.error)
        else if (res?.ok) toast.success(isActive ? "Deactivated" : "Activated")
      }}
    >
      <input type="hidden" name="id" value={id} />
      <AlertDialogAction type="submit" variant={isActive ? "destructive" : "default"}>
        {isActive ? "Deactivate" : "Activate"}
      </AlertDialogAction>
    </form>
  )
}

import { Button } from "@/components/ui/button"
import { Ban, CheckCircle } from "lucide-react"

export function ToggleActiveButton({
  action,
  id,
  isActive,
}: {
  action: (fd: FormData) => Promise<{ error?: string; ok?: boolean } | void>
  id: string
  isActive: boolean
}) {
  return (
    <form
      action={async (fd) => {
        const res = await action(fd)
        if (res?.error) toast.error(res.error)
        else if (res?.ok) toast.success(isActive ? "Deactivated" : "Activated")
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className={isActive ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : "text-success-foreground hover:bg-success/10 hover:text-success-foreground"}
      >
        {isActive ? <Ban className="mr-2 size-4" /> : <CheckCircle className="mr-2 size-4" />}
        {isActive ? "Deactivate Product" : "Activate Product"}
      </Button>
    </form>
  )
}
