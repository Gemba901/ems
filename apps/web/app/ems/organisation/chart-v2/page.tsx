"use client";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { OrganisationHeader } from "@/components/ems/OrganisationParts";
import { ORG_CHART_PATH } from "@/components/ems/organisation-navigation";
import { OrgChartV2 } from "@/components/ems/org-chart-v2/OrgChartV2";

export default function Page() {
  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl space-y-4">
        <OrganisationHeader activeTab="chart" />
        <p className="text-sm text-muted-foreground">
          Earlier chart preview ·{" "}
          <Link
            href={ORG_CHART_PATH}
            className="font-semibold text-primary hover:underline"
          >
            Open the current org chart
          </Link>
        </p>
        <OrgChartV2 />
      </div>
    </ProtectedRoute>
  );
}
