"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  filterComboboxOptions,
  type ComboboxOption,
} from "@/lib/combobox-filter"

interface ComboboxProps {
  options: ComboboxOption[]
  value: string | null
  onValueChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  clearable?: boolean
  id?: string
  /** Accessible name for the trigger when there is no visible <label>. */
  ariaLabel?: string
  className?: string
}

/**
 * Searchable single-select combobox built on Radix Popover (no extra deps).
 *
 * - Client-side substring filtering over label + keywords.
 * - Full keyboard support: type to filter, ArrowUp/Down to move, Enter to
 *   select, Escape to close. Focus moves to the search field on open and back
 *   to the trigger on close.
 * - Client filtering is a UX convenience only; the server still authorizes the
 *   final selection.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No results found.",
  disabled,
  clearable,
  id,
  ariaLabel,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [highlighted, setHighlighted] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value) ?? null
  const filtered = React.useMemo(
    () => filterComboboxOptions(options, query),
    [options, query]
  )

  // Clamp during render so the highlight always points at a visible row, even
  // after the filtered set shrinks — no setState-in-effect required.
  const activeIndex =
    filtered.length === 0
      ? -1
      : Math.min(Math.max(highlighted, 0), filtered.length - 1)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery("")
      setHighlighted(0)
    }
  }

  function commit(option: ComboboxOption) {
    onValueChange(option.value)
    setOpen(false)
    setQuery("")
    setHighlighted(0)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted(Math.min(activeIndex + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted(Math.max(activeIndex - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const option = filtered[activeIndex]
      if (option) commit(option)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    }
  }

  // Keep the highlighted row in view.
  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    )
    node?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between rounded-3xl border-transparent bg-input/50 px-3 font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="line-clamp-1 text-left">
            {selected ? selected.label : placeholder}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear selection"
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onValueChange(null)
                }}
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlighted(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={id ? `${id}-listbox` : undefined}
            aria-activedescendant={
              id && filtered[highlighted]
                ? `${id}-opt-${filtered[highlighted].value}`
                : undefined
            }
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={listRef}
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="max-h-64 overflow-y-auto p-1.5"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            filtered.map((option, index) => {
              const isSelected = option.value === value
              const isActive = index === activeIndex
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  id={id ? `${id}-opt-${option.value}` : undefined}
                  data-index={index}
                  aria-selected={isSelected}
                  onClick={() => commit(option)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none",
                    isActive && "bg-accent text-accent-foreground"
                  )}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="line-clamp-1">{option.label}</span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
