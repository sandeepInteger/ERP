import { Check } from "lucide-react";

import { ERICSSON_STEPS, ERICSSON_STEP_ORDER, EricssonStep } from "@erp/types";
import { cn } from "../../lib/utils.js";

/** The SOP steps as a row of cards: done, current, upcoming. */
export function StepTracker({ step }: { step: EricssonStep }) {
  const current = ERICSSON_STEP_ORDER.indexOf(step);
  const steps = ERICSSON_STEP_ORDER.filter((s) => s !== EricssonStep.CLOSED);

  return (
    <ol className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const isCurrent = i === current;
        return (
          <li
            key={s}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-3",
              done && "border-[var(--color-success-bg)] bg-[var(--color-success-bg)]/50",
              isCurrent && "border-brand-600 bg-brand-50 ring-1 ring-brand-600",
              !done && !isCurrent && "border-surface-200 bg-surface-0",
            )}
          >
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-surface-500">
              {done && <Check size={12} className="text-[var(--color-success-fg)]" aria-hidden="true" />}
              Step {ERICSSON_STEPS[s].sop}
            </span>
            <span className="text-[13px] font-semibold leading-snug">{ERICSSON_STEPS[s].short}</span>
          </li>
        );
      })}
    </ol>
  );
}
