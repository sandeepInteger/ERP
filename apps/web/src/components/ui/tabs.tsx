import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils.js";

/** Underlined tab strip. The page owns which tab is open. On phones it is one row that swipes sideways
 *  (instead of wrapping onto several lines); the open tab is kept in view. */
export function Tabs<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div
      ref={list}
      role="tablist"
      className={cn(
        "flex flex-wrap gap-1 border-b border-surface-200 max-md:flex-nowrap max-md:overflow-x-auto max-md:[scrollbar-width:none]",
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cn(
            "-mb-px inline-flex h-10 shrink-0 cursor-pointer whitespace-nowrap pointer-coarse:h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
            t.value === value ? "border-brand-600 text-surface-900" : "border-transparent text-surface-500 hover:text-surface-800",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-surface-100 px-1.5 text-[11px] font-bold text-surface-600">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Pill filter chips (single select). */
export function Chips<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 cursor-pointer rounded-full border px-3 pointer-coarse:h-10 text-[13px] font-medium transition-colors",
            o.value === value
              ? "border-surface-900 bg-surface-900 text-surface-0"
              : "border-surface-300 bg-surface-0 text-surface-700 hover:bg-surface-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
