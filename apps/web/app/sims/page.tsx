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
      <div className="mx-5 pt-4 md:pt-6 space-y-6">

        {/* Page header */}
        <div className="flex items-center sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="hidden sm:block text-[11px] font-bold uppercase tracking-wider text-blue-600">SIMS</p>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 sm:mt-0.5 truncate">
              Suggestions & Ideas
            </h1>
            <p className="hidden sm:block text-sm text-slate-500 mt-1 max-w-xl">
              {user?.organizationName ? `${user.organizationName}'s kaizen suggestion scheme.` : "Your kaizen suggestion scheme."} Submit ideas, track their progress, and see what&apos;s shipped.
            </p>
          </div>

          <Link
            href="/sims/new"
            className="flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-semibold sm:font-medium text-white shadow-sm hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New Suggestion</span>
            <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:order-first" />
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
