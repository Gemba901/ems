"use client";

import { SIDEBAR_PADDING } from "@/components/shell/ModuleSidebar";

import { useState } from "react";
import { Header, SkipToMainContent } from "@/components/Header";
import { KaizenSidebar } from "@/components/kaizen/KaizenSidebar";
import { ModuleGuard } from "@/components/ModuleGuard";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

// Same shell as the DWMS layout: a full sidebar that collapses to an icon rail on desktop.
export default function KaizenLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  return (
    <ModuleGuard moduleKey="KAIZEN">
      <div className="min-h-screen bg-background font-sans">
        <SkipToMainContent />
        <KaizenSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />
        <div className={`flex min-h-screen flex-col ${sidebarCollapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded}`}>
          <Header menuId="kaizen-sidebar" menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
          <main id="main-content" tabIndex={-1} className="scroll-mt-16 flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ModuleGuard>
  );
}
