"use client";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { OrganisationHeader } from "@/components/ems/OrganisationParts";
import { OrgChartV3 } from "@/components/ems/org-chart-v3/OrgChartV3";

export default function Page() {
  return (
    <ProtectedRoute>
      <div className="mx-auto w-full min-w-0 space-y-4">
        <OrganisationHeader activeTab="chart" />
        <OrgChartV3 />
      </div>
    </ProtectedRoute>
  );
}
