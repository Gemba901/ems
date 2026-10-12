"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  DwmsService,
  cleanDwmsMessage,
  getDwmsErrorMessage,
  type DwmsActivityIngestionRow,
  type DwmsActivityIngestionSummary,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import DwmsSelectDropdown from "../../../components/DwmsSelectDropdown";
import { DwmsDataField, DwmsMobileDataCard } from "../../../components/DwmsResponsive";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All rows" },
  { value: "FAILED", label: "Declined" },
  { value: "CREATED", label: "Created" },
  { value: "QUEUED", label: "Queued" },
  { value: "PROCESSING", label: "Processing" },
];

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadFailedRows(
  fileName: string,
  rows: DwmsActivityIngestionRow[],
) {
  const content = [
    [
      "Row",
      "Scope of Activity",
      "Target",
      "Activity Code",
      "Process Name",
      "Description / SOP",
      "Frequency",
      "Estimated Time (Hours)",
      "Expected Output",
      "Remarks",
      "Documents Required",
      "Gemba Section",
      "Process Area",
      "Parent Activity Code",
      "Import Error",
    ],
    ...rows
      .filter((row) => row.status === "FAILED")
      .map((row) => [
        row.rowNumber,
        row.sourcePayload?.activity.scope ?? row.scope,
        row.sourcePayload?.activity.scopeTarget ?? row.scopeTarget,
        row.sourcePayload?.activity.code ?? row.activityCode,
        row.sourcePayload?.activity.name ?? row.activityName,
        row.sourcePayload?.activity.workMethod,
        row.sourcePayload?.activity.frequency,
        row.sourcePayload?.activity.completionDeadline,
        row.sourcePayload?.activity.completionOutput,
        row.sourcePayload?.activity.remarks,
        row.sourcePayload?.activity.evidenceRequired,
        row.sourcePayload?.activity.gembaSection,
        row.sourcePayload?.activity.processArea,
        row.sourcePayload?.parentActivityCode ?? row.parentActivityCode,
        cleanDwmsMessage(row.message, "Import failed"),
      ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName.replace(/\.[^.]+$/, "") || "activity-import"}-failed-rows.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

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

export default function ActivityIngestionDetailPage() {
  return (
    <ProtectedRoute>
      <ActivityIngestionDetailContent />
    </ProtectedRoute>
  );
}

function ActivityIngestionDetailContent() {
  const params = useParams<{ ingestionId: string }>();
  const ingestionId = params.ingestionId;
  const { accessToken, user } = useAuthStore();
  const [ingestion, setIngestion] =
    useState<DwmsActivityIngestionSummary | null>(null);
  const [rows, setRows] = useState<DwmsActivityIngestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadDetail() {
      if (!accessToken || !ingestionId) return;
      setLoading(true);
      setMessage(null);
      try {
        const result = await DwmsService.getActivityIngestion(
          accessToken,
          ingestionId,
        );
        if (mounted) {
          setIngestion(result.ingestion ?? null);
          setRows(result.rows ?? []);
        }
      } catch (error) {
        if (mounted)
          setMessage(
            getDwmsErrorMessage(error, "Failed to load ingestion details"),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadDetail();
    return () => {
      mounted = false;
    };
  }, [accessToken, ingestionId, refreshKey]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const statusMatch = status === "ALL" || row.status === status;
      if (!statusMatch) return false;
      if (!q) return true;
      return [
        row.rowNumber,
        row.activityName,
        row.activityCode,
        row.scope,
        row.scopeTarget,
        row.responsibleJobRole,
        row.responsibleEmployeeCode,
        cleanDwmsMessage(row.message, "No message"),
        row.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, status]);

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 pb-10 pt-6 sm:space-y-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Link
            href="/dwms/activities/ingestions"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to ingestion history</span>
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {ingestion?.fileName ?? "Activity ingestion"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Uploaded{" "}
              {formatDateTime(ingestion?.createdAt, user?.organizationTimeZone)}{" "}
              by {ingestion?.uploadedBy?.name ?? "Unknown"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {ingestion && ingestion.failedRows > 0 && (
            <button
              type="button"
              onClick={() => downloadFailedRows(ingestion.fileName, rows)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:rounded-full sm:px-4"
            >
              <Download className="h-4 w-4" />
              Failed rows
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => setRefreshKey((value) => value + 1)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:rounded-full sm:px-4"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {message}
        </div>
      )}
      {ingestion?.failureMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {cleanDwmsMessage(ingestion.failureMessage, "The ingestion failed")}
        </div>
      )}

      {ingestion && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Total rows" value={ingestion.totalRows} />
          <SummaryTile
            label="Created"
            value={ingestion.successfulRows}
            tone="emerald"
          />
          <SummaryTile
            label="Declined"
            value={ingestion.failedRows}
            tone="rose"
          />
          <SummaryTile label="Status" value={ingestion.status} />
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search row, activity, job role, reason..."
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:ring-2 focus:ring-blue-100 sm:rounded-full"
          />
        </div>
        <div className="md:w-48">
          <DwmsSelectDropdown
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
            placeholder="Rows"
            triggerClassName="h-10 rounded-full border-slate-200 px-4 text-sm font-medium shadow-sm"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-app bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading row details...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            No rows found.
          </div>
        ) : (
          <>
          <div className="space-y-3 p-3 md:hidden">
            {filteredRows.map((row) => (
              <DwmsMobileDataCard key={row.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">Row {row.rowNumber}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-700">{row.activityName || "Not captured"}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{row.activityCode || "No code"}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "CREATED" ? "bg-emerald-50 text-emerald-700" : row.status === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>{row.status}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                  <DwmsDataField label="Scope">{row.scope?.replaceAll("_", " ") || "Legacy"}</DwmsDataField>
                  <DwmsDataField label="Target">{row.scopeTarget || "Organisation"}</DwmsDataField>
                  <DwmsDataField label="Matched">{row.assignedCount ?? 0}</DwmsDataField>
                  <DwmsDataField label="Links">{row.activityId ? "Activity linked" : "No activity"} · {row.taskId ? "Task linked" : "No task"}</DwmsDataField>
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-600">{cleanDwmsMessage(row.message, "No message")}</div>
              </DwmsMobileDataCard>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Row</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Activity</th>
                  <th className="px-5 py-3">Assignment target</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {row.rowNumber}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "CREATED" ? "bg-emerald-50 text-emerald-700" : row.status === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}
                      >
                        {row.status === "CREATED" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : row.status === "FAILED" ? (
                          <XCircle className="h-3.5 w-3.5" />
                        ) : (
                          <Loader2 className="h-3.5 w-3.5" />
                        )}
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">
                        {row.activityName || "Not captured"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {row.activityCode || "No code"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      <p className="font-semibold">
                        {row.scope?.replaceAll("_", " ") || "Legacy"}
                      </p>
                      <p>{row.scopeTarget || "Organisation"}</p>
                      <p>{row.assignedCount ?? 0} matched</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {cleanDwmsMessage(row.message, "No message")}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold">
                      <div className="flex flex-col gap-1">
                        {row.activityId ? (
                          <span className="text-blue-600">Activity linked</span>
                        ) : (
                          <span className="text-slate-400">No activity</span>
                        )}
                        {row.taskId ? (
                          <span className="text-emerald-600">Task linked</span>
                        ) : (
                          <span className="text-slate-400">No task</span>
                        )}
                      </div>
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

function SummaryTile({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "emerald" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : "text-slate-900";
  return (
    <div className="min-w-0 rounded-2xl border border-border-app bg-white p-3 shadow-sm sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={`mt-2 break-words text-xl font-extrabold sm:text-2xl ${toneClass}`}>{value}</p>
    </div>
  );
}
