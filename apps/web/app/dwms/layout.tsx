"use client";

import React, { useState } from "react";
import { ModuleGuard } from "@/components/ModuleGuard";
import { Sidebar } from "./components/Sidebar";
import { Header } from "@/components/Header";
import "./dwms.css";

export default function DwmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <ModuleGuard moduleKey="DWMS">
      <div className="min-h-screen bg-[#F4F7FA] font-sans">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
        />
        <div
          className={`flex min-h-screen flex-col ${
            sidebarCollapsed ? "lg:pl-12" : "lg:pl-64"
          }`}
        >
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </ModuleGuard>
  );
}
