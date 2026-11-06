"use client";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { OrgChartPage } from "@/components/ems/org-chart/OrgChartPage";
export default function Page() {
  return (
    <ProtectedRoute>
      <OrgChartPage />
    </ProtectedRoute>
  );
}
