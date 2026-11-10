import type { ReactNode } from "react";

/** Page title block: small kicker, title, description, and actions on the right. */
export function PageHeader({
  kicker, title, description, actions,
}: { kicker?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker && <div className="text-[11px] font-bold uppercase tracking-wider text-surface-500">{kicker}</div>}
        <h1 className="mt-1 text-2xl font-bold leading-tight text-surface-900">{title}</h1>
        {description && <div className="mt-1.5 text-sm text-surface-500">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Standard page padding and vertical rhythm. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8">{children}</div>;
}
