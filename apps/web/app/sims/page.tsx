"use client";

import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { Plus } from "lucide-react";
import EmployeeDashboard from "@/components/sims/dashboards/EmployeeDashboard";
import HodDashboard from "@/components/sims/dashboards/HodDashboard";
import AdminDashboard from "@/components/sims/dashboards/AdminDashboard";

export default function SimsOverviewPage() {
  const { user } = useAuthStore();
  const role = user?.roleLevel;

  return (
    <ProtectedRoute
      allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}
    >
      <div className="mx-5 space-y-6">

        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">SIMS</p>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
              Suggestions & Ideas
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              {user?.organizationName ? `${user.organizationName}'s kaizen suggestion scheme.` : "Your kaizen suggestion scheme."} Submit ideas, track their progress, and see what&apos;s shipped.
            </p>
          </div>

          <Link
            href="/sims/new"
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            New Suggestion
          </Link>
        </div>

        {role === Role.EMPLOYEE ? (
          <EmployeeDashboard />
        ) : role === Role.HOD ? (
          <HodDashboard />
        ) : (
          <AdminDashboard />
        )}

      </div>
    </ProtectedRoute>
  );
}
