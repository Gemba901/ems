"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useAuthStore } from "@/store/auth.store";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { EmsCompletionBanner } from "@/components/EmsCompletionBanner";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const [ready, setReady] = useState(() => {
    const { _hasHydrated, isAuthenticated, user } = useAuthStore.getState();
    return _hasHydrated && !!isAuthenticated && !!user;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: handleToggleSidebar } = useSidebarCollapsed();

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [_hasHydrated, isAuthenticated, user, router]);

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F4F7FA]">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7FA] font-sans">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggle={handleToggleSidebar}
      />

      <div className={`flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        {/* <EmsCompletionBanner /> */}
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}