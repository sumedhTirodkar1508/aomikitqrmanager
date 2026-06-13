import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string | React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-3xl space-y-1.5">
        <p className="section-label">AOMI Kit</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <div className="text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
          {action}
        </div>
      )}
    </header>
  )
}
