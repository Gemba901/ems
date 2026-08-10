"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth.store";
import { SteelDashboardService } from "@/services/steel-dashboard.service";
import { QueryErrorState } from "./QueryErrorState";

// Activity codes are process-scoped (A01-A12/A14) — labels mirror each
// process controller's own activity documentation (P01-A01..A12,
// P02-A01..A12, P03-A01..A14, P04-A01..A12).
const ACTIVITY_LABELS: Record<string, Record<string, string>> = {
  P01: {
    A01: "Demand captured",
    A02: "Priority confirmed",
    A03: "Product confirmed",
    A04: "Specification confirmed",
    A05: "Stock checked",
    A06: "Stock decision made",
    A07: "Route selected",
    A08: "Material checked",
    A09: "Capacity checked",
    A10: "Production plan drafted",
    A11: "Plan communicated",
    A12: "Production plan released",
  },
  P02: {
    A01: "Requirement reviewed",
    A02: "Material type identified",
    A03: "Supplier checked",
    A04: "Supplier risk checked",
    A05: "Quotations collected",
    A06: "Suppliers compared",
    A07: "Specification confirmed",
    A08: "Purchase order created",
    A09: "Delivery schedule confirmed",
    A10: "Import logistics prepared",
    A11: "Intake team informed",
    A12: "Sourcing handover closed",
  },
  P03: {
    A01: "Gate arrival recorded",
    A02: "Documents verified",
    A03: "Gross weight captured",
    A04: "Safety checked",
    A05: "Area assigned",
    A06: "Visual inspection recorded",
    A07: "Hazard check recorded",
    A08: "Radiation check recorded",
    A09: "Certificate verified",
    A10: "Acceptance decision recorded",
    A11: "Material unloaded",
    A12: "Net weight captured",
    A13: "Yard stored",
    A14: "Stock released",
  },
  P04: {
    A01: "Requirement reviewed",
    A02: "Material lots selected",
    A03: "Scrap sorted",
    A04: "Scrap cut",
    A05: "Contaminants removed",
    A06: "Additives prepared",
    A07: "Return scrap checked",
    A08: "Charge recipe prepared",
    A09: "Material staged",
    A10: "Material verified",
    A11: "Charge released",
    A12: "Furnace handover closed",
  },
};

function formatActivity(process: string, activity: string) {
  return ACTIVITY_LABELS[process]?.[activity] ?? activity;
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentActivity() {
  const { accessToken } = useAuthStore();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["steel-recent-activity"],
    queryFn: () => SteelDashboardService.getRecentActivity(accessToken!, 5),
    enabled: !!accessToken,
  });

  // Dashboard display limit only — the backend still holds full history per
  // process; this panel is a 5-item preview of it.
  const items = (data ?? []).slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
        ) : isError ? (
          <QueryErrorState onRetry={() => refetch()} isRetrying={isFetching} message="Could not load recent activity." />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No recent activity.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">
                      <span className="font-mono text-xs text-slate-400 mr-1.5">{item.process}</span>
                      {formatActivity(item.process, item.activity)}
                      <span className="text-slate-400"> · {item.reference}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">{item.performedBy}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {formatTimestamp(item.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
