import { NavLink, useNavigate } from "react-router-dom";
import { ClipboardList, FileWarning, LayoutDashboard, LogOut, RadioTower, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import { ADMIN_ROLES, ROLE_LABELS, type Role } from "@erp/types";
import { api, setAccessToken } from "../lib/api.js";
import { useMe } from "../context/MeContext.js";
import { cn } from "../lib/utils.js";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown only when this returns true (default: always). */
  when?: (role: string) => boolean;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Clients are separate workflows, so each gets its own group. AT&T joins here later.
const NAV: NavGroup[] = [
  { label: "", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Ericsson IBS",
    items: [
      { to: "/ericsson/sites", label: "Site tracker", icon: RadioTower },
      { to: "/ericsson/change-requests", label: "Change requests", icon: FileWarning },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/admin/users", label: "Users & roles", icon: Users, when: (r) => ADMIN_ROLES.has(r) },
      { to: "/admin/raci", label: "RACI matrix", icon: ClipboardList },
    ],
  },
];

export function SidebarNav() {
  const me = useMe();
  const navigate = useNavigate();

  async function signOut() {
    try { await api.post("/auth/logout"); } catch { /* signing out locally either way */ }
    setAccessToken(null);
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-surface-200 bg-surface-0 p-4 md:w-60 md:border-r md:border-b-0">
      <div className="flex items-center gap-2.5 px-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-base font-bold text-white" aria-hidden="true">I</div>
        <div>
          <div className="text-[15px] font-bold leading-tight">Integer ERP</div>
          <div className="text-xs text-surface-500">Project tracker</div>
        </div>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-4">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.when || i.when(me.role));
          if (!items.length) return null;
          return (
            <div key={group.label || "top"} className="flex flex-col gap-0.5">
              {group.label && <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-surface-500">{group.label}</div>}
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) =>
                    cn(
                      "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors",
                      isActive ? "bg-brand-600 text-white" : "text-surface-700 hover:bg-surface-100",
                    )
                  }
                >
                  <item.icon size={16} strokeWidth={1.9} aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2 rounded-lg bg-surface-50 p-3">
        <ShieldCheck size={16} className="shrink-0 text-surface-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{me.firstName} {me.lastName}</div>
          <div className="truncate text-xs text-surface-500">{ROLE_LABELS[me.role as Role] ?? me.role}</div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-surface-500 hover:bg-surface-200 hover:text-surface-900"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
