"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { LoadingState } from "@/components/patterns/LoadingState";
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
  const ready = _hasHydrated && isAuthenticated && !!user;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: handleToggleSidebar } = useSidebarCollapsed();

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <LoadingState label="Loading dashboard…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggle={handleToggleSidebar}
      />

      <div className={`flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? "lg:pl-[88px]" : "lg:pl-64"}`}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <EmsCompletionBanner />
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}