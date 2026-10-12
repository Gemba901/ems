"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsActivityIngestionSummary,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import ActivityTabs from "../ActivityTabs";
import { DwmsDataField, DwmsMobileDataCard } from "../../components/DwmsResponsive";

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
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "bg-rose-50 text-rose-700";
  return "bg-blue-50 text-blue-700";
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
  const [ingestions, setIngestions] = useState<DwmsActivityIngestionSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

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
        if (mounted)
          setMessage(
            getDwmsErrorMessage(error, "Failed to load ingestion history"),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadHistory();
    return () => {
      mounted = false;
    };
  }, [accessToken, refreshKey]);

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
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 pb-10 pt-6 sm:space-y-6 sm:px-6 sm:pt-8 lg:px-8">
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
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:ring-2 focus:ring-blue-100 sm:rounded-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            disabled={loading}
            onClick={() => setRefreshKey((value) => value + 1)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:rounded-full sm:px-4"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/dwms/actions/new?mode=ACTIVITY"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:rounded-full sm:px-4"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Import sheet</span>
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-app bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading ingestion history...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            No ingestion history found.
          </div>
        ) : (
          <>
          <div className="space-y-3 p-3 md:hidden">
            {filtered.map((ingestion) => (
              <DwmsMobileDataCard key={ingestion.id}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p className="min-w-0 break-all font-semibold text-slate-900">{ingestion.fileName}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ingestion.status)}`}>{ingestion.status}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                  <DwmsDataField label="Uploaded by">{ingestion.uploadedBy?.name ?? "Unknown"}</DwmsDataField>
                  <DwmsDataField label="Uploaded">{formatDateTime(ingestion.createdAt, user?.organizationTimeZone)}</DwmsDataField>
                  <DwmsDataField label="Total rows">{ingestion.totalRows}</DwmsDataField>
                  <DwmsDataField label="Result"><span className="text-emerald-700">{ingestion.successfulRows} created</span><span className="mx-1 text-slate-300">·</span><span className="text-rose-700">{ingestion.failedRows} declined</span></DwmsDataField>
                </div>
                <Link href={`/dwms/activities/ingestions/${ingestion.id}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
                  View row details <ArrowRight className="h-4 w-4" />
                </Link>
              </DwmsMobileDataCard>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {ingestion.fileName}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {ingestion.uploadedBy?.name ?? "Unknown"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {ingestion.totalRows}
                    </td>
                    <td className="px-5 py-4 text-emerald-700">
                      {ingestion.successfulRows}
                    </td>
                    <td className="px-5 py-4 text-rose-700">
                      {ingestion.failedRows}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ingestion.status)}`}
                      >
                        {ingestion.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDateTime(
                        ingestion.createdAt,
                        user?.organizationTimeZone,
                      )}
                    </td>
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
          </>
        )}
      </div>
    </div>
  );
}
