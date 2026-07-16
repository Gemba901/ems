"use client";

import { useState } from "react";
import { SteelSidebar } from "@/components/steel/SteelSidebar";
import { Header } from "@/components/Header";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
// import { ModuleGuard } from "@/components/ModuleGuard";

export default function SteelLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <div className="min-h-screen bg-[#F4F7FA] font-sans">
      <SteelSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggle={toggle} />
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
