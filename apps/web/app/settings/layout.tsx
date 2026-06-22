"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <div className="min-h-screen bg-[#F4F7FA] font-sans">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggle={toggle} />
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
