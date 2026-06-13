"use client"

import { useActionState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Ban } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { voidToken, type TokenActionState } from "../actions"

export default function VoidTokenButton({ id, variant = "icon" }: { id: string; variant?: "icon" | "full" }) {
  const [, formAction, pending] = useActionState<TokenActionState, FormData>(
    async (prev, fd) => {
      const res = await voidToken(prev, fd)
      if (res.error) toast.error(res.error)
      else if (res.ok) toast.success("Token voided")
      return res
    },
    {}
  )

  const trigger = variant === "full" ? (
    <AlertDialogTrigger asChild>
      <Button
        variant="destructive"
        disabled={pending}
        className="gap-2 font-medium"
      >
        <Ban className="size-4" />
        Void Token
      </Button>
    </AlertDialogTrigger>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label="Void Token"
            >
              <Ban className="size-4" />
            </Button>
          </AlertDialogTrigger>
        </span>
      </TooltipTrigger>
      <TooltipContent>Void Token</TooltipContent>
    </Tooltip>
  )

  return (
    <AlertDialog>
      {trigger}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void Token</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to void this token? This action cannot be undone and will revoke the token&apos;s lifecycle immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <AlertDialogAction type="submit" variant="destructive">
              Void
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
