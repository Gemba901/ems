"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/auth.store";
import { getNotifications } from "@/services/notifications.service";
import { QueryErrorState } from "./QueryErrorState";

const TYPE_STYLES: Record<string, string> = {
  ACTION_REQUIRED: "bg-red-50 text-red-700",
  ALERT: "bg-amber-50 text-amber-700",
  REMINDER: "bg-blue-50 text-blue-700",
  INFO: "bg-slate-100 text-slate-600",
};

// The steel domain does not create notifications today (no controller/service
// under apps/api/src/steel calls notifications.create with module "steel"),
// so this filters the generic notification feed down to what would apply —
// currently always empty until that wiring exists.
export function AlertsPanel() {
  const { accessToken } = useAuthStore();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["notifications", "steel"],
    queryFn: () => getNotifications(accessToken!, 1, 20),
    enabled: !!accessToken,
  });

  const steelAlerts = (data?.notifications ?? []).filter(
    (n) => n.module?.toLowerCase() === "steel",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-400" />
          Alerts & Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
        ) : isError ? (
          <QueryErrorState onRetry={() => refetch()} isRetrying={isFetching} message="Could not load alerts." />
        ) : steelAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <p className="text-sm text-slate-500">No alerts yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {steelAlerts.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.actionUrl ?? "#"}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <p className="text-sm text-slate-800 truncate">{n.title}</p>
                  <Badge className={`shrink-0 ${TYPE_STYLES[n.type] ?? "bg-slate-100 text-slate-600"}`}>
                    {n.type.replace(/_/g, " ")}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
