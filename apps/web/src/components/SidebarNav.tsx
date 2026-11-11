import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BadgeCheck, BarChart3, BellRing, ClipboardList, Wallet, FileWarning, LayoutDashboard, ListChecks, LogOut, Menu, RadioTower, Receipt,
  ShieldCheck, Smartphone, Users, X, type LucideIcon,
} from "lucide-react";

import { ADMIN_ROLES, ERICSSON_FINANCE_VIEW_ROLES, LEADERSHIP_ROLES, ROLE_LABELS, Role } from "@erp/types";
import { api, setAccessToken } from "../lib/api.js";
import { useMe } from "../context/MeContext.js";
import { cn } from "../lib/utils.js";
import { canSeeCosts } from "./ericsson/ExpensesPanel.js";

/** Who gets the phone-first field view: the people on site, and whoever covers for them. */
const FIELD_ROLES = new Set<string>([Role.FIELD_CREW, Role.DELIVERY_LEAD, Role.PROJECT_MANAGER, Role.OPS_LEADER, Role.ADMIN]);

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown only when this returns true (default: always). */
  when?: (role: string) => boolean;
  /** Field crew see only items marked for them. */
  crew?: boolean;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Clients are separate workflows, so each gets its own group. AT&T joins here later.
const NAV: NavGroup[] = [
  {
    label: "",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/my-work", label: "My work", icon: ListChecks },
      { to: "/approvals/expenses", label: "Expense approvals", icon: BadgeCheck, when: (r) => r !== Role.VIEWER && r !== Role.FIELD_CREW },
    ],
  },
  {
    label: "Ericsson IBS",
    items: [
      { to: "/field", label: "Field · today", icon: Smartphone, when: (r) => FIELD_ROLES.has(r), crew: true, end: true },
      { to: "/field/expenses", label: "My expenses", icon: Wallet, when: (r) => r === Role.FIELD_CREW, crew: true },
      { to: "/ericsson/sites", label: "Site tracker", icon: RadioTower },
      { to: "/ericsson/change-requests", label: "Change requests", icon: FileWarning },
      { to: "/ericsson/expenses", label: "Daily tracker & costs", icon: Receipt, when: (r) => canSeeCosts(r) },
      { to: "/ericsson/reports", label: "Revenue & cost", icon: BarChart3, when: (r) => ERICSSON_FINANCE_VIEW_ROLES.has(r) },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/admin/users", label: "Users & roles", icon: Users, when: (r) => ADMIN_ROLES.has(r) },
      { to: "/admin/raci", label: "RACI matrix", icon: ClipboardList },
      { to: "/admin/notifications", label: "Notifications & escalation", icon: BellRing, when: (r) => LEADERSHIP_ROLES.has(r) || r === Role.PROJECT_MANAGER },
    ],
  },
];

export function SidebarNav() {
  const me = useMe();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Phones: the menu folds away behind a button; it closes again after every navigation.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    try { await api.post("/auth/logout"); } catch { /* signing out locally either way */ }
    setAccessToken(null);
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-surface-200 bg-surface-0 p-3 lg:w-60 lg:border-r lg:border-b-0 lg:p-4">
      <div className="flex items-center gap-2.5 px-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-base font-bold text-white" aria-hidden="true">I</div>
        <div className="flex-1">
          <div className="text-[15px] font-bold leading-tight">Integer ERP</div>
          <div className="text-xs text-surface-500">Project tracker</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="main-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex size-11 cursor-pointer items-center justify-center rounded-md text-surface-700 hover:bg-surface-100 lg:hidden"
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      <nav id="main-menu" aria-label="Main" className={cn("flex-col gap-4 lg:flex", open ? "flex" : "hidden")}>
        {NAV.map((group) => {
          const isCrew = me.role === Role.FIELD_CREW;
          const items = group.items.filter((i) => (isCrew ? i.crew === true : !i.when || i.when(me.role)));
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

      <div className={cn("mt-auto items-center gap-2 rounded-lg bg-surface-50 p-3 lg:flex", open ? "flex" : "hidden")}>
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
