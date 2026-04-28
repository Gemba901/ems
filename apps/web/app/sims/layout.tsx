"use client";

import { useState } from "react";
import { SimsSidebar } from "@/components/sims/SimsSidebar";
import { Header } from "@/components/Header";

export default function SimsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F4F7FA] font-sans">
      <SimsSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="md:pl-24 flex flex-col min-h-screen transition-all duration-300">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
