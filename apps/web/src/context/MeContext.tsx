import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { api } from "../lib/api.js";

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  designation: string | null;
  role: string;
}

const MeContext = createContext<Me | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get<Me>("/auth/me").then((r) => setMe(r.data)).catch(() => setFailed(true));
  }, []);

  if (failed) return <div className="p-8 text-surface-600">Could not load your profile. Reload the page to try again.</div>;
  if (!me) return <div className="flex h-screen items-center justify-center text-surface-500">Loading…</div>;
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** The signed-in user. Only usable inside AuthGuard (MeProvider renders children once loaded). */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside MeProvider");
  return me;
}
