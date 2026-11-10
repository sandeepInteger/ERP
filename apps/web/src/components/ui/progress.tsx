import { cn } from "../../lib/utils.js";

/**
 * Horizontal bar, value 0–100. The fill width is a runtime value, so it is set via
 * style inside this primitive (the documented exception for ui/ primitives).
 */
export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
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
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${v}%` }} />
    </div>
  );
}
