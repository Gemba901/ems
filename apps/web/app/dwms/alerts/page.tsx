"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsAlertItem,
  type DwmsAlertListTab,
  type DwmsAccessCapabilities,
} from "@/services/dwms.service";
import DwmsTabHeader from "../components/DwmsTabHeader";
import DwmsSelectDropdown from "../components/DwmsSelectDropdown";

const MANAGEMENT_ROLES = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);

const allTabs: Array<{ key: DwmsAlertListTab; label: string; dotColor: string }> = [
  { key: "MY_ALERTS", label: "My Alerts", dotColor: "bg-blue-500" },
  { key: "TEAM_ALERTS", label: "My Team's Alerts", dotColor: "bg-sky-500" },
  { key: "DEPARTMENTAL", label: "Department Alerts", dotColor: "bg-violet-500" },
  { key: "ORGANISATIONAL", label: "Organization Alerts", dotColor: "bg-emerald-500" },
  { key: "OPENED_BY_ME", label: "Opened by Me", dotColor: "bg-slate-400" },
];

const severityOptions = [
  { value: "ALL", label: "All severities" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

export default function AlertsRoute() {
  return <ProtectedRoute><Suspense fallback={<div className="p-8">Loading alerts...</div>}><AlertsPage /></Suspense></ProtectedRoute>;
}

function AlertsPage() {
  const router = useRouter();
  const timeZone = useAuthStore((state) => state.user?.organizationTimeZone) || "UTC";
  const isManagement = useAuthStore((state) => MANAGEMENT_ROLES.has(String(state.user?.roleLevel ?? "").toUpperCase()));
  const [tab, setTab] = useState<DwmsAlertListTab>("MY_ALERTS");
  const [alerts, setAlerts] = useState<DwmsAlertItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("ALL");
  const [access, setAccess] = useState<DwmsAccessCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = useAuthStore.getState().accessToken ?? "";
    void DwmsService.getAccessCapabilities(token)
      .then(setAccess)
      .catch((cause) => setError(getDwmsErrorMessage(cause, "Failed to load alert access.")));
  }, []);

  const tabs = useMemo(() => allTabs.filter((item) => {
    if (item.key === "TEAM_ALERTS") return isManagement || access?.hasReportees;
    if (item.key === "DEPARTMENTAL") return access?.alertViewLevel === "DEPARTMENT" || access?.alertViewLevel === "ORGANIZATION";
    if (item.key === "ORGANISATIONAL") return access?.alertViewLevel === "ORGANIZATION";
    return true;
  }), [access, isManagement]);

  useEffect(() => {
    if (access && !tabs.some((item) => item.key === tab)) {
      setTab("MY_ALERTS");
      setPage(1);
    }
  }, [access, tab, tabs]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const response = await DwmsService.getAlerts(token, { tab, page, limit: 20, search, severity });
      setAlerts(response.alerts ?? []);
      setPages(response.pagination?.pages ?? 0);
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to load alerts."));
    } finally {
      setLoading(false);
    }
  }, [tab, page, search, severity]);

  useEffect(() => { void load(); }, [load]);

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone, dateStyle: "medium", timeStyle: "short",
    }).format(new Date(value));
  }

  return (
    <main className="mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <DwmsTabHeader activeTab={tab} onTabChange={(next) => { setTab(next as DwmsAlertListTab); setPage(1); }} tabs={tabs} />
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Search alerts"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search alerts..."
          className="min-w-48 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
        />
        <DwmsSelectDropdown
          value={severity}
          options={severityOptions}
          onChange={(next) => { setSeverity(next); setPage(1); }}
          placeholder="All severities"
          ariaLabel="Severity"
          className="w-44"
          triggerClassName="h-10 rounded-xl px-4 text-sm shadow-none"
        />
        <button type="button" onClick={() => router.push("/dwms/actions/new?mode=alert")} className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
          Raise New Alert
        </button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading alerts...</p>
        : alerts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center text-sm text-slate-500">No alerts found in this section.</div>
        : <div className="grid gap-4">
          {alerts.map((alert) => {
            const showResponsible = tab === "TEAM_ALERTS" || tab === "OPENED_BY_ME";
            const person = showResponsible ? alert.responsibleEmployee : alert.raisedBy;
            const personLabel = showResponsible ? "Responsible" : "Raised by";

            return <button
              key={alert.id}
              type="button"
              onClick={() => router.push(`/dwms/alerts/${alert.id}`)}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{alert.severity}</span>
                {alert.raiseCount === 2 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Raised twice</span>}
                {alert.responsibleEmployee && <span className={alert.pendingAcknowledgments ? "rounded-full bg-amber-50 px-2.5 py-1 text-amber-800" : "rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800"}>
                  {alert.pendingAcknowledgments ? `${alert.pendingAcknowledgments} Not Acknowledged` : "Acknowledged"}
                </span>}
                <span className="ml-auto font-normal text-slate-500">{formatDate(alert.updatedAt ?? alert.createdAt)}</span>
              </div>
              <h2 className="mt-3 text-base font-semibold text-slate-900">{alert.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{alert.description}</p>
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                {person && <span>{personLabel}: {person.name}</span>}
                {alert.department && <span>Department: {alert.department.name}</span>}
              </div>
            </button>;
          })}
        </div>}
      {pages > 1 && <div className="flex items-center justify-end gap-3 text-sm">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next</button>
      </div>}
    </main>
  );
}
