"use client";

import { SteelHomeHeader } from "@/components/steel/dashboard/SteelHomeHeader";
import { SteelKpiCards } from "@/components/steel/dashboard/SteelKpiCards";
import { ManufacturingFlow } from "@/components/steel/dashboard/ManufacturingFlow";
import { ProcessOverview } from "@/components/steel/dashboard/ProcessOverview";
import { AlertsPanel } from "@/components/steel/dashboard/AlertsPanel";
import { TodaysTasks } from "@/components/steel/dashboard/TodaysTasks";
import { RecentActivity } from "@/components/steel/dashboard/RecentActivity";

export default function SteelModuleLandingPage() {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <SteelHomeHeader />

      <SteelKpiCards />

      <ManufacturingFlow />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <ProcessOverview />
        </div>
        <div className="space-y-4">
          <AlertsPanel />
          <TodaysTasks />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
