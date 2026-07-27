"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { MONTH_SHORT } from "./calendarUtils";

export function AnalyticsPanel({
  analytics, loading, year, onYearChange, isAdmin,
}: {
  analytics: any;
  loading: boolean;
  year: number;
  onYearChange: (y: number) => void;
  isAdmin: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
      </div>
    );
  }

  const maxMonthTotal = analytics
    ? Math.max(...analytics.byMonth.map((m: any) => m.total), 1)
    : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => onYearChange(year - 1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <span className="text-base font-bold text-slate-800 min-w-[60px] text-center">{year}</span>
        <button onClick={() => onYearChange(year + 1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {!analytics ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-14 text-center text-slate-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-slate-500">No data for {year}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: "Total Visits",      value: analytics.totalVisits,    color: "text-blue-600",   bg: "bg-blue-50"    },
              { label: "Completed",         value: analytics.completedVisits, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Pending Requests",  value: analytics.pendingRequests, color: "text-amber-600",  bg: "bg-amber-50"   },
              {
                label: "Completion Rate",
                value: analytics.totalVisits > 0
                  ? `${Math.round((analytics.completedVisits / analytics.totalVisits) * 100)}%`
                  : "—",
                color: "text-indigo-600", bg: "bg-indigo-50",
              },
              { label: "Date Changes", value: analytics.totalReschedules ?? 0, color: "text-rose-600", bg: "bg-rose-50" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">{kpi.label}</p>
                <p className={`text-3xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Visits by Month</h3>
            <div className="flex items-end gap-2 h-40">
              {analytics.byMonth.map((m: any) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: "120px" }}>
                    <div
                      className="w-full bg-blue-500 rounded-sm transition-all duration-300"
                      style={{ height: `${Math.round((m.total / maxMonthTotal) * 100)}%`, minHeight: m.total > 0 ? "4px" : "0" }}
                      title={`${m.total} visits`}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium">{MONTH_SHORT[m.month - 1]}</p>
                  {m.total > 0 && <p className="text-[9px] text-blue-500 font-bold">{m.total}</p>}
                </div>
              ))}
            </div>
          </div>

          {isAdmin && analytics.byOrg && analytics.byOrg.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Visits by Partner</h3>
              <div className="space-y-3">
                {analytics.byOrg.map((row: any) => (
                  <div key={row.orgId}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-700">{row.orgName}</p>
                      <p className="text-xs text-slate-500">{row.completed}/{row.total}</p>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
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
