"use client";

import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import './dwms.css';

export default function DwmsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();

  useEffect(() => {
    try {
      if (localStorage.theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    } catch {}
  }, []);

  return (
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
  );
}

