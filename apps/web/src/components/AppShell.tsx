import { Outlet } from "react-router-dom";

import { PageBackProvider } from "../context/PageBackContext.js";
import { SidebarNav } from "./SidebarNav.js";
import { TopHeaderBar } from "./TopHeaderBar.js";

export function AppShell() {
  return (
    <PageBackProvider>
      {/* Phones: the sidebar stacks above the content instead of sitting beside it. */}
      <div className="flex min-h-screen flex-col md:h-screen md:flex-row md:overflow-hidden">
        <SidebarNav />
        <main className="flex min-w-0 flex-1 flex-col bg-surface-50 md:overflow-y-auto [scrollbar-gutter:stable]">
          <TopHeaderBar />
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    </PageBackProvider>
  );
}
