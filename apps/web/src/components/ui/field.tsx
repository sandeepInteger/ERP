import * as React from "react";

import { cn } from "../../lib/utils.js";

/** A labelled form row: label above the control, optional hint below. */
export function Field({
  label, hint, className, children,
}: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-[13px] font-semibold text-surface-700", className)}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-surface-500">{hint}</span>}
    </label>
  );
}

/** A responsive grid of Fields. */
export function FieldGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

/** Inline error text under a form. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <p role="alert" className="rounded-md bg-[var(--color-error-bg)] px-3 py-2 text-[13px] text-[var(--color-error-fg)]">{message}</p>;
}
