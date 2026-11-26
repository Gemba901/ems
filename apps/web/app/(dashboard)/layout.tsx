"use client";

import { SIDEBAR_PADDING } from "@/components/shell/ModuleSidebar";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MAIN_SIDEBAR_ID, Sidebar } from "@/components/Sidebar";
import { LoadingState } from "@/components/patterns/LoadingState";
import { Header, SkipToMainContent } from "@/components/Header";
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
      <SkipToMainContent />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggle={handleToggleSidebar}
      />

      <div className={`flex flex-col min-h-screen transition-[padding] duration-300 motion-reduce:transition-none ${sidebarCollapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded}`}>
        <Header menuId={MAIN_SIDEBAR_ID} menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
        <EmsCompletionBanner />
        <main id="main-content" tabIndex={-1} className="scroll-mt-16 flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
