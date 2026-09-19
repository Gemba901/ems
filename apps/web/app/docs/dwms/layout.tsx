"use client";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { ModuleGuard } from "@/components/ModuleGuard";
import { Header } from "@/components/Header";

export default function DwmsDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ModuleGuard moduleKey="DWMS">
        <div className="flex min-h-screen flex-col bg-[#F4F7FA] font-sans">
          <Header />
          <main className="flex-1">{children}</main>
        </div>
      </ModuleGuard>
    </ProtectedRoute>
  );
}
