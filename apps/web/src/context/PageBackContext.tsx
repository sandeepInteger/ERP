import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Same rule as HRMS: a Back button that LEAVES the page lives in the top bar, registered
// with usePageBack(). In-page back (wizard step, drill-down) stays inline.

export interface PageBackTarget {
  to: string;
  label: string;
}

interface PageBackValue {
  back: PageBackTarget | null;
  setBack: (t: PageBackTarget | null) => void;
}

const PageBackContext = createContext<PageBackValue>({ back: null, setBack: () => {} });

export function PageBackProvider({ children }: { children: ReactNode }) {
  const [back, setBack] = useState<PageBackTarget | null>(null);
  const value = useMemo(() => ({ back, setBack }), [back]);
  return <PageBackContext.Provider value={value}>{children}</PageBackContext.Provider>;
}

export function usePageBackTarget(): PageBackTarget | null {
  return useContext(PageBackContext).back;
}

/** Registers this page's Back button in the top bar; clears itself on unmount. */
export function usePageBack(to: string, label = "Back"): void {
  const { setBack } = useContext(PageBackContext);
  useEffect(() => {
    setBack({ to, label });
    return () => setBack(null);
  }, [setBack, to, label]);
}
