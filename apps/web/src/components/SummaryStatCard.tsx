import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";

/** Icon + label + value tile for KPI rows. Pass `to` to make the whole tile a link. */
export function SummaryStatCard({
  icon: Icon, label, value, caption, to, className,
}: { icon: LucideIcon; label: string; value: ReactNode; caption?: string | undefined; to?: string | undefined; className?: string | undefined }) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-brand-50 text-brand-600">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-surface-500">{label}</span>
      </div>
      <div className="text-[26px] font-bold leading-none text-surface-900">{value}</div>
      {caption && <div className="text-xs text-surface-500">{caption}</div>}
    </>
  );
  const cls = cn("flex flex-col gap-3 rounded-lg border border-surface-200 bg-surface-0 p-4", className);
  return to ? (
    <Link to={to} className={cn(cls, "transition-shadow hover:border-brand-300 hover:shadow-md")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
