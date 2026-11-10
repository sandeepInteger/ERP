import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { cn } from "../lib/utils.js";

type Tone = "success" | "error" | "info";
interface Toast { id: number; tone: Tone; message: string }

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Tone = "success") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
              t.tone === "success" && "bg-[var(--color-success-bg)] text-[var(--color-success-fg)]",
              t.tone === "error" && "bg-[var(--color-error-bg)] text-[var(--color-error-fg)]",
              t.tone === "info" && "bg-[var(--color-info-bg)] text-[var(--color-info-fg)]",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
