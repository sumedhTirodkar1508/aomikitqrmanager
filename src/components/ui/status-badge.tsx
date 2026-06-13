import { CircleCheck, CircleDashed, CircleX, Clock3, RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusConfig = {
  ACTIVE: {
    label: "Active",
    icon: CircleCheck,
    className: "bg-success text-success-foreground",
  },
  INACTIVE: {
    label: "Inactive",
    icon: CircleDashed,
    className: "bg-muted text-muted-foreground",
  },
  AVAILABLE: {
    label: "Available",
    icon: CircleCheck,
    className: "bg-info text-info-foreground",
  },
  ASSIGNED: {
    label: "Assigned",
    icon: Clock3,
    className: "bg-warning text-warning-foreground",
  },
  ACTIVATED: {
    label: "Activated",
    icon: CircleCheck,
    className: "bg-success text-success-foreground",
  },
  VOIDED: {
    label: "Voided",
    icon: CircleX,
    className: "bg-destructive/10 text-destructive",
  },
  REPLACED: {
    label: "Replaced",
    icon: RotateCcw,
    className: "bg-primary/10 text-primary",
  },
} as const

type KnownStatus = keyof typeof statusConfig

export function StatusBadge({
  status,
  className,
}: {
  status: KnownStatus | string
  className?: string
}) {
  const config = statusConfig[status as KnownStatus]

  if (!config) {
    return (
      <Badge variant="secondary" className={className}>
        {status}
      </Badge>
    )
  }

  const Icon = config.icon

  return (
    <Badge className={cn("gap-1 border-0", config.className, className)}>
      <Icon aria-hidden="true" className="size-3" />
      {config.label}
    </Badge>
  )
}
