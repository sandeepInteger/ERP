import * as React from "react";

import { cn } from "../../lib/utils.js";

/** Checkbox with its label; the whole row is the click target. */
export function Checkbox({
  label, className, ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11 pointer-coarse:gap-3", className)}>
      <input type="checkbox" className="size-4 cursor-pointer accent-[var(--color-brand-600)] pointer-coarse:size-5" {...props} />
      {label}
    </label>
  );
}
