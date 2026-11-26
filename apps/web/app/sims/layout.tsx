"use client";

import { SIDEBAR_PADDING } from "@/components/shell/ModuleSidebar";

import { useState } from "react";
import { SimsSidebar } from "@/components/sims/SimsSidebar";
import { Header, SkipToMainContent } from "@/components/Header";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { ModuleGuard } from "@/components/ModuleGuard";

// Same shell as the Kaizen/SGA layouts: a full sidebar that collapses to an icon rail on desktop.
export default function SimsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <ModuleGuard moduleKey="SIMS">
      <div className="min-h-screen bg-background font-sans">
        <SkipToMainContent />
        <SimsSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggle={toggle} />
        <div className={`flex min-h-screen flex-col ${collapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded}`}>
          <Header menuId="sims-sidebar" menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
          <main id="main-content" tabIndex={-1} className="scroll-mt-16 flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ModuleGuard>
  );
}
