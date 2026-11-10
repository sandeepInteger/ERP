import { Navigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.js";
import { MeProvider } from "../context/MeContext.js";
import { AppShell } from "./AppShell.js";

export function AuthGuard() {
  const { accessToken, isLoading } = useAuth();

  if (isLoading) return <div className="flex h-screen items-center justify-center text-surface-500">Loading…</div>;
  if (!accessToken) return <Navigate to="/login" replace />;
  return (
    <MeProvider>
      <AppShell />
    </MeProvider>
  );
}
