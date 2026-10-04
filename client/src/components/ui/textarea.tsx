import * as React from "react"

import { cn } from "@/lib/utils"

// Multi-line text field matching <Input> (border, focus ring, hover, disabled, text size) — use it instead of a raw
// <textarea> with hand-copied classes. Defaults to 3 rows; `className="min-h-…"` / `rows` to resize.
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, rows = 3, ...props }, ref) => {
    return (
      <textarea
        rows={rows}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-2xs ring-offset-background transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
