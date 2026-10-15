"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, OnboardingBatchSummary, OnboardingBatchStatus, BATCH_STATUS_LABELS,
} from "@/services/ems.service";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Loader2, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import ConfirmDialog from "@/components/ems/ConfirmDialog";


/** How each record status is shown in the breakdown. NEEDS_FIXING also covers rows waiting on a manager's chain. */
const COUNT_PARTS = [
  { key: "REGISTERED",   label: "registered",      bar: "bg-emerald-500", text: "text-emerald-700" },
  { key: "READY",        label: "ready",           bar: "bg-blue-500",    text: "text-blue-700" },
  { key: "NEEDS_FIXING", label: "need attention",  bar: "bg-amber-400",   text: "text-amber-700" },
  { key: "DRAFT",        label: "not yet validated", bar: "bg-slate-300", text: "text-slate-500" },
  { key: "EXCLUDED",     label: "excluded",        bar: "bg-slate-200",   text: "text-slate-400" },
] as const;

/** Total records, a proportional bar, and the non-zero counts, e.g. "14 registered · 3 need attention". */
function RecordBreakdown({ batch }: { batch: OnboardingBatchSummary }) {
  const total = batch._count.records;
  const counts = batch.statusCounts;
  // Older API responses have no counts: show the total only, never invented zeros.
  if (!counts || total === 0) return <span className="text-slate-500">{total}</span>;
  const parts = COUNT_PARTS.filter((p) => (counts[p.key] ?? 0) > 0);
  return (
    <div className="min-w-44 space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-slate-800">{total}</span>
        <span className="text-xs text-slate-400">records</span>
      </div>
      <div className="flex h-1.5 w-40 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {parts.map((p) => (
          <div key={p.key} className={p.bar} style={{ width: `${(counts[p.key] / total) * 100}%` }} />
        ))}
      </div>
      <p className="text-xs">
        {parts.map((p, i) => (
          <span key={p.key} className={p.text}>
            {i > 0 && <span className="text-slate-300"> · </span>}
            {counts[p.key]} {p.label}
          </span>
        ))}
      </p>
    </div>
  );
}

type SortKey = "newest" | "oldest" | "updated" | "name" | "records" | "attention";

const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);
/** Last-modified time, if the API sends one (older responses don't). */
const updatedAt = (b: OnboardingBatchSummary) => (b as OnboardingBatchSummary & { updatedAt?: string }).updatedAt;

/** How each sort option orders two imports. */
const SORTS: { key: SortKey; label: string; compare: (a: OnboardingBatchSummary, b: OnboardingBatchSummary) => number }[] = [
  { key: "newest",    label: "Newest added",           compare: (a, b) => time(b.createdAt) - time(a.createdAt) },
  { key: "oldest",    label: "Oldest added",           compare: (a, b) => time(a.createdAt) - time(b.createdAt) },
  { key: "updated",   label: "Recently updated",       compare: (a, b) => time(updatedAt(b) ?? b.createdAt) - time(updatedAt(a) ?? a.createdAt) },
  { key: "name",      label: "Name (A–Z)",             compare: (a, b) => (a.label ?? "").localeCompare(b.label ?? "") },
  { key: "records",   label: "Most records",           compare: (a, b) => b._count.records - a._count.records },
  { key: "attention", label: "Most needing attention", compare: (a, b) => (b.statusCounts?.NEEDS_FIXING ?? 0) - (a.statusCounts?.NEEDS_FIXING ?? 0) },
];

function BatchStatusPill({ status }: { status: OnboardingBatchStatus }) {
  const colour =
    status === "REGISTERED"           ? "bg-emerald-100 text-emerald-700" :
    status === "PARTIALLY_REGISTERED" ? "bg-amber-100 text-amber-700" :
    status === "READY"                ? "bg-blue-100 text-blue-700" :
    status === "CANCELLED"            ? "bg-red-100 text-red-700" :
                                        "bg-slate-100 text-slate-500";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colour}`}>
      {BATCH_STATUS_LABELS[status]}
    </span>
  );
}

export default function EmsOnboardingPage() {
  const { accessToken } = useAuthStore();
  const router = useRouter();

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["ems-onboarding-batches"],
    queryFn: () => EmsService.listOnboardingBatches(accessToken!),
    enabled: !!accessToken,
  });

  const [showCancelled, setShowCancelled] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  // The import waiting for HR to confirm cancelling or deleting it.
  const [confirming, setConfirming] = useState<{ kind: "cancel" | "delete"; batch: OnboardingBatchSummary } | null>(null);
  const queryClient = useQueryClient();

  const cancel = useMutation({
    mutationFn: (batchId: string) => EmsService.cancelOnboardingBatch(batchId, accessToken!),
    onSuccess: () => { setConfirming(null); queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] }); },
  });

  const remove = useMutation({
    mutationFn: (batchId: string) => EmsService.deleteOnboardingBatch(batchId, accessToken!),
    onSuccess: () => { setConfirming(null); queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] }); },
  });

  const allBatches: OnboardingBatchSummary[] = data ?? [];
  const visible = showCancelled
    ? allBatches
    : allBatches.filter((b) => b.status !== "CANCELLED");
  // Sort a copy (never the cached list itself); ties fall back to newest first.
  const sorter = SORTS.find((s) => s.key === sortBy) ?? SORTS[0];
  const batches = [...visible].sort((a, b) => sorter.compare(a, b) || time(b.createdAt) - time(a.createdAt));
  // "Recently updated" only makes sense once the API sends a last-modified time.
  const canSortByUpdated = allBatches.some((b) => updatedAt(b));
  const cancelledCount = allBatches.filter((b) => b.status === "CANCELLED").length;
  const error = queryError ? (queryError as any).message : null;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/ems" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">BEES Onboarding imports</h1>
            <p className="text-sm text-slate-500">Employee data uploaded for registration</p>
          </div>
          <Link
            href="/ems/onboarding/new"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
          >
            <Upload className="h-3.5 w-3.5" /> New import
          </Link>
        </div>

        {allBatches.length > 1 && (
          <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
            <label htmlFor="imports-sort" className="font-medium">Sort by</label>
            <select
              id="imports-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {SORTS.filter((s) => s.key !== "updated" || canSortByUpdated).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="px-5 py-4 text-sm text-red-600">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide">Batch</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Records</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Uploaded by</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {batches.map((batch) => (
                    <tr
                      key={batch.id}
                      onClick={() => router.push(`/ems/onboarding/${batch.id}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-slate-300" />
                          <div>
                            <p className="font-medium text-slate-800">{batch.label ?? "Untitled import"}</p>
                            {batch.sourceFileName && (
                              <p className="text-xs text-slate-400">{batch.sourceFileName}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><RecordBreakdown batch={batch} /></td>
                      <td className="px-4 py-3"><BatchStatusPill status={batch.status} /></td>
                      <td className="px-4 py-3 text-slate-500">{batch.uploadedBy?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(batch.createdAt).toLocaleDateString()}
                      </td>

                      <td className="px-5 py-3 text-right">
                        {/* Clicks on these controls must not also open the row. */}
                        <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/ems/onboarding/${batch.id}`}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700"
                          >
                            Open
                          </Link>
                          {batch.status === "CANCELLED" ? (
                            <button
                              onClick={() => setConfirming({ kind: "delete", batch })}
                              disabled={remove.isPending}
                              title="Delete permanently"
                              className="text-slate-300 hover:text-red-600 disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirming({ kind: "cancel", batch })}
                              disabled={cancel.isPending}
                              title="Cancel this import"
                              className="text-slate-300 hover:text-amber-600 disabled:opacity-40"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {batches.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">
                        No imports yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {cancelledCount > 0 && (
            <div className="px-5 py-3 border-t border-slate-100">
              <button
                onClick={() => setShowCancelled((v) => !v)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                {showCancelled ? "Hide" : "Show"} {cancelledCount} cancelled
              </button>
            </div>
          )}
        </div>
      </div>

      {confirming && (() => {
        const { kind, batch } = confirming;
        const name = batch.label ?? "this import";
        const n = batch._count.records;
        const records = `${n} record${n === 1 ? "" : "s"}`;
        const action = kind === "delete" ? remove : cancel;
        return (
          <ConfirmDialog
            open
            title={kind === "delete" ? `Delete "${name}" permanently?` : `Cancel "${name}"?`}
            message={kind === "delete"
              ? `Its ${records} will be removed and can't be recovered.`
              : `Its ${records} won't be registered. You can delete it afterwards.`}
            keepLabel={kind === "delete" ? "Keep it" : "Keep import"}
            confirmLabel={kind === "delete" ? "Delete permanently" : "Cancel import"}
            busy={action.isPending}
            onConfirm={() => action.mutate(batch.id)}
            onClose={() => { setConfirming(null); action.reset(); }}
          />
        );
      })()}
    </ProtectedRoute>
  );
}
