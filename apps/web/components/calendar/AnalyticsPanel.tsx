"use client";

import { Button } from "@/components/ui/button";

import type { CalendarAnalytics } from "@/services/calendar.service";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { MONTH_SHORT } from "./calendarUtils";

export function AnalyticsPanel({
  analytics, loading, year, onYearChange, isAdmin,
}: {
  analytics?: CalendarAnalytics;
  loading: boolean;
  year: number;
  onYearChange: (y: number) => void;
  isAdmin: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
      </div>
    );
  }

  const maxMonthTotal = analytics
    ? Math.max(...analytics.byMonth.map((m) => m.total), 1)
    : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => onYearChange(year - 1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </Button>
        <span className="text-base font-bold text-foreground min-w-[60px] text-center">{year}</span>
        <Button variant="ghost" onClick={() => onYearChange(year + 1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {!analytics ? (
        <div className="bg-card border border-border rounded-2xl p-14 text-center text-muted-foreground">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-muted-foreground">No data for {year}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: "Total Visits",      value: analytics.totalVisits,    color: "text-info",   bg: "bg-info-subtle"    },
              { label: "Completed",         value: analytics.completedVisits, color: "text-success", bg: "bg-success-subtle" },
              { label: "Pending Requests",  value: analytics.pendingRequests, color: "text-warning",  bg: "bg-warning-subtle"   },
              {
                label: "Completion Rate",
                value: analytics.totalVisits > 0
                  ? `${Math.round((analytics.completedVisits / analytics.totalVisits) * 100)}%`
                  : "—",
                color: "text-primary", bg: "bg-primary/10",
              },
              { label: "Date Changes", value: analytics.totalReschedules ?? 0, color: "text-rose-600", bg: "bg-rose-50" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-muted-foreground">{kpi.label}</p>
                <p className={`text-3xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-foreground mb-4">Visits by Month</h3>
            <div className="flex items-end gap-2 h-40">
              {analytics.byMonth.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: "120px" }}>
                    <div
                      className="w-full bg-info rounded-sm transition-all duration-300"
                      style={{ height: `${Math.round((m.total / maxMonthTotal) * 100)}%`, minHeight: m.total > 0 ? "4px" : "0" }}
                      title={`${m.total} visits`}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground font-medium">{MONTH_SHORT[m.month - 1]}</p>
                  {m.total > 0 && <p className="text-[9px] text-info font-bold">{m.total}</p>}
                </div>
              ))}
            </div>
          </div>

          {isAdmin && analytics.byOrg && analytics.byOrg.length > 0 && (
            <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
              <h3 className="text-sm font-bold text-foreground mb-4">Visits by Partner</h3>
              <div className="space-y-3">
                {analytics.byOrg.map((row) => (
                  <div key={row.orgId}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground">{row.orgName}</p>
                      <p className="text-xs text-muted-foreground">{row.completed}/{row.total}</p>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full"
                        style={{ width: `${Math.round((row.total / analytics.totalVisits) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
