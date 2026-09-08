"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileSpreadsheet, Loader2, Search } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsActivityIngestionSummary,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";

function formatDateTime(value?: string | null, timeZone?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusClass(status: string) {
  return status === "COMPLETED"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-blue-50 text-blue-700";
}

export default function ActivityIngestionsPage() {
  return (
    <ProtectedRoute>
      <ActivityIngestionsContent />
    </ProtectedRoute>
  );
}

function ActivityIngestionsContent() {
  const { accessToken, user } = useAuthStore();
  const [ingestions, setIngestions] = useState<DwmsActivityIngestionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadHistory() {
      if (!accessToken) return;
      setLoading(true);
      setMessage(null);
      try {
        const result = await DwmsService.getActivityIngestions(accessToken);
        if (mounted) setIngestions(result.ingestions ?? []);
      } catch (error) {
        if (mounted) setMessage(getDwmsErrorMessage(error, "Failed to load ingestion history"));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadHistory();
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ingestions;
    return ingestions.filter((ingestion) =>
      [ingestion.fileName, ingestion.status, ingestion.uploadedBy?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [ingestions, search]);

  return (
    <div className="w-full space-y-6 px-4 pt-8 pb-10 sm:px-6 lg:px-8">
      <ActivityTabs active="ingestions" />
      {message && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search file, uploader, status..."
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <Link
          href="/dwms/actions/new?mode=ACTIVITY"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>Import sheet</span>
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-app bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading ingestion history...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No ingestion history found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">File</th>
                  <th className="px-5 py-3">Uploaded By</th>
                  <th className="px-5 py-3">Rows</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Declined</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Uploaded</th>
                  <th className="px-5 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((ingestion) => (
                  <tr key={ingestion.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-900">{ingestion.fileName}</td>
                    <td className="px-5 py-4 text-slate-600">{ingestion.uploadedBy?.name ?? "Unknown"}</td>
                    <td className="px-5 py-4 text-slate-600">{ingestion.totalRows}</td>
                    <td className="px-5 py-4 text-emerald-700">{ingestion.successfulRows}</td>
                    <td className="px-5 py-4 text-rose-700">{ingestion.failedRows}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ingestion.status)}`}>
                        {ingestion.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(ingestion.createdAt, user?.organizationTimeZone)}</td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/dwms/activities/ingestions/${ingestion.id}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                        title="View row details"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityTabs({ active }: { active: "activities" | "ingestions" }) {
  const tabs = [
    { key: "activities", label: "All Activities", href: "/dwms/activities" },
    {
      key: "ingestions",
      label: "Ingestion History",
      href: "/dwms/activities/ingestions",
    },
  ] as const;

  return (
    <div className="flex gap-6 overflow-x-auto border-b border-border-app select-none">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`relative flex items-center border-b-2 pb-3 text-sm font-semibold transition duration-150 ${
            active === tab.key
              ? "border-blue-500 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
