"use client";

import Link from "next/link";
import { PageHeader } from "@/components/patterns/PageHeader";
import { buttonVariants } from "@/components/ui/button";
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
      <div className="space-y-section">
        <PageHeader
          title="Suggestions & Ideas"
          description={`${user?.organizationName ? `${user.organizationName}'s` : "Your"} kaizen suggestion scheme. Submit ideas and track their progress.`}
          actions={
            <Link href="/sims/new" className={buttonVariants()}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              New Suggestion
            </Link>
          }
        />

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
