import { LucideIcon, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string | React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = HelpCircle,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("surface-panel flex flex-col items-center justify-center border border-dashed border-border bg-card/80 p-8 text-center sm:p-12", className)}>
      <div className="icon-tile">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        {title}
      </h3>
      {description && (
        <div className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </div>
      )}
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  )
}
