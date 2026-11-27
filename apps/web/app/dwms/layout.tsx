"use client";

import { SIDEBAR_PADDING } from "@/components/shell/ModuleSidebar";

import React, { useState } from "react";
import { ModuleGuard } from "@/components/ModuleGuard";
import { Sidebar } from "./components/Sidebar";
import { Header, SkipToMainContent } from "@/components/Header";
import "./dwms.css";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

export default function DwmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  return (
    <ModuleGuard moduleKey="DWMS">
      <div className="dwms-shell min-h-screen bg-background font-sans">
        <SkipToMainContent />
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />
        <div
          className={`flex min-h-screen flex-col ${
            sidebarCollapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded
          }`}
        >
          <Header menuId="dwms-sidebar" menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
          <main id="main-content" tabIndex={-1} className="scroll-mt-16 min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </ModuleGuard>
  );
}
