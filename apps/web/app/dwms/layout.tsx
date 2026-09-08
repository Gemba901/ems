"use client";

import React, { useState } from 'react';
import { ModuleGuard } from '@/components/ModuleGuard';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import './dwms.css';

export default function DwmsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <ModuleGuard moduleKey="DWMS">
      <div className="min-h-screen bg-[#F4F7FA] font-sans">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggle={toggle}
        />
        <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </ModuleGuard>
  );
}

