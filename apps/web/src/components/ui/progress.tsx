import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const fill = cva("h-full rounded-full transition-[width] duration-300", {
  variants: {
    tone: {
      brand: "bg-brand-600",
      warning: "bg-warning",
      success: "bg-success",
      error: "bg-error",
    },
  },
  defaultVariants: { tone: "brand" },
});

/**
 * Horizontal bar, value 0–100. The fill width is a runtime value, so it is set via
 * style inside this primitive (the documented exception for ui/ primitives).
 */
export function Progress({
  value, className, label, tone,
}: { value: number; className?: string; label?: string } & VariantProps<typeof fill>) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-surface-100", className)}
    >
      <div className={fill({ tone })} style={{ width: `${v}%` }} />
    </div>
  );
}
