"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { DwmsService, getDwmsErrorMessage, type DwmsAccessCapabilities, type DwmsAlertItem, type DwmsAlertListTab } from "@/services/dwms.service";
import DwmsTabHeader from "../components/DwmsTabHeader";
import DwmsSelectDropdown from "../components/DwmsSelectDropdown";

const MANAGEMENT_ROLES = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);

const allTabs: Array<{ key: DwmsAlertListTab; label: string; dotColor: string }> = [
  { key: "MY_ABNORMALITIES", label: "My Abnormalities", dotColor: "bg-rose-500" },
  { key: "TEAM_ABNORMALITIES", label: "My Team's Abnormalities", dotColor: "bg-orange-500" },
];

const severityOptions = [
  { value: "ALL", label: "All severities" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

export default function AbnormalitiesRoute() {
  return <ProtectedRoute><Suspense fallback={<div className="p-8">Loading abnormalities...</div>}><AbnormalitiesPage /></Suspense></ProtectedRoute>;
}

function AbnormalitiesPage() {
  const router = useRouter();
  const timeZone = useAuthStore((state) => state.user?.organizationTimeZone) || "UTC";
  const isManagement = useAuthStore((state) => MANAGEMENT_ROLES.has(String(state.user?.roleLevel ?? "").toUpperCase()));
  const [tab, setTab] = useState<DwmsAlertListTab>("MY_ABNORMALITIES");
  const [items, setItems] = useState<DwmsAlertItem[]>([]);
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
      .catch((cause) => setError(getDwmsErrorMessage(cause, "Failed to load abnormality access.")));
  }, []);

  const tabs = useMemo(
    () => allTabs.filter((item) => item.key !== "TEAM_ABNORMALITIES" || isManagement || access?.hasReportees),
    [access, isManagement],
  );

  useEffect(() => {
    if (access && !tabs.some((item) => item.key === tab)) {
      setTab("MY_ABNORMALITIES");
      setPage(1);
    }
  }, [access, tab, tabs]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const response = await DwmsService.getAlerts(token, { tab, page, limit: 20, search, severity });
      setItems(response.alerts ?? []); setPages(response.pagination?.pages ?? 0);
    } catch (cause) { setError(getDwmsErrorMessage(cause, "Failed to load abnormalities.")); }
    finally { setLoading(false); }
  }, [tab, page, search, severity]);

  useEffect(() => { void load(); }, [load]);
  const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return <main className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
    <DwmsTabHeader activeTab={tab} onTabChange={(next) => { setTab(next as DwmsAlertListTab); setPage(1); }} tabs={tabs} />
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <input aria-label="Search abnormalities" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search abnormalities..." className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm" />
      <DwmsSelectDropdown
        value={severity}
        options={severityOptions}
        onChange={(next) => { setSeverity(next); setPage(1); }}
        placeholder="All severities"
        ariaLabel="Severity"
        className="w-full sm:w-44"
        triggerClassName="h-10 rounded-xl px-4 text-sm shadow-none"
      />
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading abnormalities...</p>
      : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center text-sm text-slate-500">No abnormalities found in this section.</div>
      : <div className="grid gap-4">{items.map((item) => {
        const showResponsible = tab === "TEAM_ABNORMALITIES";
        const person = showResponsible ? item.responsibleEmployee : item.raisedBy;
        const personLabel = showResponsible ? "Responsible" : "Raised by";

        return <button key={item.id} type="button" onClick={() => router.push(`/dwms/alerts/${item.id}`)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-rose-300 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold"><span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">Abnormality</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{item.severity}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Raised {item.raiseCount} times</span>{item.responsibleEmployee && <span className={item.pendingAcknowledgments ? "rounded-full bg-amber-50 px-2.5 py-1 text-amber-800" : "rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800"}>{item.pendingAcknowledgments ? `${item.pendingAcknowledgments} Not Acknowledged` : "Acknowledged"}</span>}<span className="w-full font-normal text-slate-500 sm:ml-auto sm:w-auto">{formatDate(item.updatedAt ?? item.createdAt)}</span></div>
        <h2 className="mt-3 text-base font-semibold text-slate-900">{item.title}</h2><p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.description}</p>
        {person && <div className="mt-3 text-xs text-slate-500">{personLabel}: {person.name}</div>}
      </button>;
      })}</div>}
    {pages > 1 && <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm sm:flex sm:justify-end sm:gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="min-h-11 rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="min-h-11 rounded-lg border px-3 py-2 disabled:opacity-50">Next</button></div>}
  </main>;
}
