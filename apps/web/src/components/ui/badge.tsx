import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

// Status pill on the semantic bg/fg token pairs from tokens.css.
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--color-neutral-bg)] text-[var(--color-neutral-fg)]",
        success: "bg-[var(--color-success-bg)] text-[var(--color-success-fg)]",
        warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]",
        error: "bg-[var(--color-error-bg)] text-[var(--color-error-fg)]",
        info: "bg-[var(--color-info-bg)] text-[var(--color-info-fg)]",
        accent: "bg-[var(--color-accent-bg)] text-[var(--color-accent-fg)]",
        outline: "border border-surface-300 bg-transparent text-surface-600",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
