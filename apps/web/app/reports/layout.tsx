"use client";

import { SIDEBAR_PADDING } from "@/components/shell/ModuleSidebar";

import { useState } from "react";
import { MAIN_SIDEBAR_ID, Sidebar } from "@/components/Sidebar";
import { Header, SkipToMainContent } from "@/components/Header";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <div className="min-h-screen bg-background font-sans">
      <SkipToMainContent />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggle={toggle} />
      <div className={`flex flex-col min-h-screen transition-[padding] duration-300 motion-reduce:transition-none ${collapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded}`}>
        <Header menuId={MAIN_SIDEBAR_ID} menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />

        <main id="main-content" tabIndex={-1} className="scroll-mt-16 flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
