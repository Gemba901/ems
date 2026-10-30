"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Wrench,
  FlaskConical,
  ClipboardCheck,
  ClipboardList,
  HeartPulse,
  CalendarDays,
} from "lucide-react";
import { Header } from "@/components/Header";
import { ModuleSidebar } from "@/components/shell/ModuleSidebar";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { useAuthStore } from "@/store/auth.store";
import { AssetsProvider } from "./AssetsProvider";
import { HealthCheckupsProvider } from "./health-checkups/HealthCheckupsProvider";
import { InspectionsProvider } from "./inspections/InspectionsProvider";
import { WorkOrdersProvider } from "./work-orders/WorkOrdersProvider";
import { MaintenancePlansProvider } from "./planning/MaintenancePlansProvider";
import "./tpm.css";

export function TpmShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();
  const router = useRouter();
  useEffect(() => {
    if (_hasHydrated && (!user || !isAuthenticated)) router.replace("/login");
  }, [_hasHydrated, user, isAuthenticated, router]);
  if (!_hasHydrated || !user || !isAuthenticated)
    return (
      <div className="tpm-loading" role="status">
        Opening your workspace…
      </div>
    );
  return (
    <AssetsProvider key={`${user.organizationId}:${user.userId}`}>
      <HealthCheckupsProvider>
        <InspectionsProvider>
          <WorkOrdersProvider>
            <MaintenancePlansProvider>
              <div className="tpm-shell min-h-screen bg-[#f6f8fa]">
                <ModuleSidebar
                  id="tpm-sidebar"
                  title="TPM"
                  subtitle="Total productive maintenance"
                  homeHref="/tpm/assets"
                  ariaLabel="TPM navigation"
                  brand={
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-white">
                      <Wrench size={19} />
                    </span>
                  }
                  open={open}
                  onClose={() => setOpen(false)}
                  collapsed={collapsed}
                  onToggle={toggle}
                  groups={[
                    {
                      name: "Equipment",
                      items: [
                        {
                          label: "Assets",
                          href: "/tpm/assets",
                          icon: Boxes,
                          exact: false,
                        },
                        {
                          label: "Health checkups",
                          href: "/tpm/health-checkups",
                          icon: HeartPulse,
                        },
                      ],
                    },
                    {
                      name: "Maintenance",
                      items: [
                        {
                          label: "PM Planning",
                          href: "/tpm/planning",
                          icon: CalendarDays,
                        },
                        {
                          label: "Work orders",
                          href: "/tpm/work-orders",
                          icon: ClipboardList,
                        },
                        {
                          label: "Inspection",
                          href: "/tpm/inspections",
                          icon: ClipboardCheck,
                        },
                      ],
                    },
                  ]}
                  footer={(rail) =>
                    !rail && (
                      <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <FlaskConical size={14} /> TPM workspace preview
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          Manage equipment, maintenance plans, health checkups,
                          inspections and work orders.
                        </p>
                      </div>
                    )
                  }
                />
                <div
                  className={`min-h-screen ${collapsed ? "lg:pl-[88px]" : "lg:pl-64"}`}
                >
                  <Header onMenuClick={() => setOpen(true)} />
                  <main className="tpm-main">
                    <div className="tpm-preview-note">
                      <FlaskConical size={15} />
                      <span>
                        <strong>Interactive preview</strong>
                        <span className="tpm-note-divider">·</span>
                        Changes stay in this browser; they are not shared with
                        your team.
                      </span>
                    </div>
                    {children}
                  </main>
                </div>
              </div>
            </MaintenancePlansProvider>
          </WorkOrdersProvider>
        </InspectionsProvider>
      </HealthCheckupsProvider>
    </AssetsProvider>
  );
}
