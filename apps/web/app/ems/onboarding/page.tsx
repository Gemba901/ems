"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, OnboardingBatchSummary, OnboardingBatchStatus, BATCH_STATUS_LABELS,
} from "@/services/ems.service";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Loader2, FileSpreadsheet, Search, Trash2, Upload, X } from "lucide-react";
import ConfirmDialog from "@/components/ems/ConfirmDialog";


/** How each record status is shown in the breakdown. NEEDS_FIXING also covers rows waiting on a manager's chain. */
const COUNT_PARTS = [
  { key: "REGISTERED",   label: "registered",      bar: "bg-emerald-500", text: "text-emerald-700" },
  { key: "READY",        label: "ready",           bar: "bg-blue-500",    text: "text-blue-700" },
  { key: "NEEDS_FIXING", label: "need attention",  bar: "bg-amber-400",   text: "text-amber-700" },
  { key: "DRAFT",        label: "not yet validated", bar: "bg-slate-300", text: "text-slate-500" },
  { key: "EXCLUDED",     label: "excluded",        bar: "bg-slate-200",   text: "text-slate-400" },
] as const;

/**
 * Registration progress for one import:
 *   "226 of 231 registered · 97%"   (excluded rows don't count towards the total)
 *   a proportional bar
 *   the other non-zero counts, e.g. "5 need attention · 3 excluded"
 */
function RecordBreakdown({ batch }: { batch: OnboardingBatchSummary }) {
  const total = batch._count.records;
  const counts = batch.statusCounts;
  // Older API responses have no counts: show the total only, never invented zeros.
  if (!counts || total === 0) return <span className="text-slate-500">{total}</span>;
  const registered = counts.REGISTERED ?? 0;
  const intended = total - (counts.EXCLUDED ?? 0);
  // Rounded down, so it never shows 100% until everyone meant to be registered is; a start shows as <1%, not 0%.
  const pct = intended > 0 ? Math.floor((registered / intended) * 100) : 0;
  const parts = COUNT_PARTS.filter((p) => (counts[p.key] ?? 0) > 0);
  const others = parts.filter((p) => p.key !== "REGISTERED");
  return (
    <div className="min-w-52 space-y-1">
      <p className="text-xs whitespace-nowrap" title={`${registered} of ${intended} registered (excluded rows not counted)`}>
        {intended > 0 ? <>
          <span className="font-semibold text-slate-800">{registered}</span>
          <span className="text-slate-500"> of </span>
          <span className="font-semibold text-slate-800">{intended}</span>
          <span className="text-slate-500"> registered · </span>
          <span className={`font-semibold ${pct === 100 ? "text-emerald-700" : "text-slate-800"}`}>{registered > 0 && pct === 0 ? "<1" : pct}%</span>
        </> : <span className="text-slate-500">{total} records · all excluded</span>}
      </p>
      <div className="flex h-1.5 w-48 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {parts.map((p) => (
          <div key={p.key} className={p.bar} style={{ width: `${(counts[p.key] / total) * 100}%` }} />
        ))}
      </div>
      {others.length > 0 && (
        <p className="text-xs whitespace-nowrap">
          {others.map((p, i) => (
            <span key={p.key} className={p.text}>
              {i > 0 && <span className="text-slate-300"> · </span>}
              {counts[p.key]} {p.label}
            </span>
          ))}
        </p>
      )}
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

/** Which imports to show. "ACTIVE" (the default) hides cancelled imports, as the page always has. */
type StatusFilter = "ACTIVE" | "ALL" | OnboardingBatchStatus;

type Filters = {
  search: string; status: StatusFilter; uploader: string;
  emptyOnly: boolean; attentionOnly: boolean; from: string; to: string;
};
const NO_FILTERS: Filters = { search: "", status: "ACTIVE", uploader: "", emptyOnly: false, attentionOnly: false, from: "", to: "" };

/** Does an import pass every filter? Dates compare by calendar day in the viewer's time zone. */
function matches(b: OnboardingBatchSummary, f: Filters): boolean {
  if (f.status === "ACTIVE" && b.status === "CANCELLED") return false;
  if (f.status !== "ACTIVE" && f.status !== "ALL" && b.status !== f.status) return false;
  if (f.uploader && (b.uploadedBy?.name ?? "") !== f.uploader) return false;
  if (f.emptyOnly && b._count.records !== 0) return false;
  if (f.attentionOnly && !((b.statusCounts?.NEEDS_FIXING ?? 0) > 0)) return false;
  const day = new Date(b.createdAt).toLocaleDateString("en-CA"); // YYYY-MM-DD, same format as <input type="date">
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  const q = f.search.trim().toLowerCase();
  if (q && ![b.label, b.sourceFileName, b.uploadedBy?.name].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
  return true;
}

/** Imports that can't be cancelled: some or all of their people are already registered. */
const cannotCancel = (b: OnboardingBatchSummary) => b.status === "REGISTERED" || b.status === "PARTIALLY_REGISTERED";

/** "19 Oct, 14:32", plus a relative hint: "2 h ago", "3 d ago". */
function when(iso: string): { at: string; ago: string } {
  const d = new Date(iso);
  const at = d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  return { at, ago };
}

/** The one thing to do next for an import, from its counts. */
function nextStep(b: OnboardingBatchSummary): { text: string; tone: string } | null {
  const c = b.statusCounts;
  if (!c || b.status === "CANCELLED" || b._count.records === 0) return null;
  const intended = b._count.records - (c.EXCLUDED ?? 0);
  if (intended > 0 && (c.REGISTERED ?? 0) === intended) return { text: "Complete", tone: "text-emerald-700" };
  if ((c.NEEDS_FIXING ?? 0) > 0) return { text: `Fix ${c.NEEDS_FIXING} row${c.NEEDS_FIXING === 1 ? "" : "s"}`, tone: "text-amber-700" };
  if ((c.READY ?? 0) > 0) return { text: `${c.READY} ready to register`, tone: "text-blue-700" };
  if ((c.DRAFT ?? 0) > 0) return { text: "Not checked yet: validate", tone: "text-slate-600" };
  return null;
}

/** Filters and sort as page-address parameters, so they survive going into an import and back. */
const PARAM_KEYS: (keyof Filters)[] = ["search", "status", "uploader", "emptyOnly", "attentionOnly", "from", "to"];
function filtersFromUrl(params: URLSearchParams): Partial<Filters> {
  const f: Partial<Filters> = {};
  for (const k of PARAM_KEYS) {
    const v = params.get(k);
    if (v === null) continue;
    if (k === "emptyOnly" || k === "attentionOnly") f[k] = v === "1";
    else (f as Record<string, string>)[k] = v;
  }
  return f;
}

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

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const filtersOn = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  // Default: the import worked on most recently first, so it is at the top when you come back.
  const [sortBy, setSortBy] = useState<SortKey>("updated");

  // Read filters/sort from the address once on arrival, then keep the address in step with them.
  const fromUrlDone = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilters((f) => ({ ...f, ...filtersFromUrl(params) }));
    const sort = params.get("sort") as SortKey | null;
    if (sort && SORTS.some((x) => x.key === sort)) setSortBy(sort);
    fromUrlDone.current = true;
  }, []);
  useEffect(() => {
    if (!fromUrlDone.current) return;
    const params = new URLSearchParams();
    for (const k of PARAM_KEYS) {
      const v = filters[k], d = NO_FILTERS[k];
      if (v !== d) params.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
    }
    if (sortBy !== "updated") params.set("sort", sortBy);
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [filters, sortBy]);
  // Ticked imports, by id. Actions only ever use the ticked imports that are currently shown.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // A bulk action waiting for confirmation, one in progress, and the summary of the last one.
  const [bulkConfirm, setBulkConfirm] = useState<"cancel" | "delete" | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ done: string; problems: string[] } | null>(null);
  // The import waiting for HR to confirm cancelling or deleting it.
  const [confirming, setConfirming] = useState<{ kind: "cancel" | "delete" | "blocked"; batch: OnboardingBatchSummary } | null>(null);
  const queryClient = useQueryClient();

  // A refused cancel/delete closes its dialog and explains why, instead of failing silently.
  const showRefusal = (kind: "cancel" | "delete", batchId: string, error: unknown) => {
    const name = allBatches.find((b) => b.id === batchId)?.label ?? "Untitled import";
    setConfirming(null);
    setBulkResult({ done: kind === "cancel" ? "Not cancelled" : "Not deleted",
      problems: [`${name}: ${(error as Error)?.message || "the server refused this action"}`] });
    queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
  };

  const cancel = useMutation({
    mutationFn: (batchId: string) => EmsService.cancelOnboardingBatch(batchId, accessToken!),
    onSuccess: () => { setConfirming(null); queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] }); },
    onError: (error, batchId) => showRefusal("cancel", batchId, error),
  });

  const remove = useMutation({
    mutationFn: (batchId: string) => EmsService.deleteOnboardingBatch(batchId, accessToken!),
    onSuccess: () => { setConfirming(null); queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] }); },
    onError: (error, batchId) => showRefusal("delete", batchId, error),
  });

  const allBatches: OnboardingBatchSummary[] = data ?? [];
  const visible = allBatches.filter((b) => matches(b, filters));
  const uploaders = useMemo(
    () => [...new Set(allBatches.map((b) => b.uploadedBy?.name).filter((n): n is string => !!n))].sort(),
    [allBatches],
  );
  // Sort a copy (never the cached list itself); ties fall back to newest first.
  const sorter = SORTS.find((s) => s.key === sortBy) ?? SORTS[0];
  const batches = [...visible].sort((a, b) => sorter.compare(a, b) || time(b.createdAt) - time(a.createdAt));
  // "Recently updated" only makes sense once the API sends a last-modified time.
  const canSortByUpdated = allBatches.some((b) => updatedAt(b));
  const cancelledCount = allBatches.filter((b) => b.status === "CANCELLED").length;

  // Totals across all open imports (ignoring filters): a one-glance view of where onboarding stands.
  const open = allBatches.filter((b) => b.status !== "CANCELLED");
  const sum = (key: "REGISTERED" | "READY" | "NEEDS_FIXING") => open.reduce((n, b) => n + (b.statusCounts?.[key] ?? 0), 0);
  const totals = {
    registered: sum("REGISTERED"), ready: sum("READY"), attention: sum("NEEDS_FIXING"),
    unchecked: open.filter((b) => (b.statusCounts?.DRAFT ?? 0) > 0).length,
  };
  // Open imports sharing a file name: the usual sign of the same sheet uploaded more than once.
  const sameFile = new Map<string, number>();
  for (const b of open) {
    const key = (b.sourceFileName ?? "").trim().toLowerCase();
    if (key) sameFile.set(key, (sameFile.get(key) ?? 0) + 1);
  }
  const copiesOf = (b: OnboardingBatchSummary) => sameFile.get((b.sourceFileName ?? "").trim().toLowerCase()) ?? 0;

  // Selection, limited to what's shown, split by what each bulk action can act on.
  const shownSelected = batches.filter((b) => selected.has(b.id));
  const toCancel = shownSelected.filter((b) => b.status !== "CANCELLED" && !cannotCancel(b));
  const toDelete = shownSelected.filter((b) => b.status === "CANCELLED");
  const allShownTicked = batches.length > 0 && batches.every((b) => selected.has(b.id));
  const someShownTicked = shownSelected.length > 0 && !allShownTicked;
  function toggle(id: string) {
    setSelected((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleAllShown() {
    setSelected((s) => {
      const next = new Set(s);
      if (allShownTicked) batches.forEach((b) => next.delete(b.id)); else batches.forEach((b) => next.add(b.id));
      return next;
    });
  }

  /** Run cancel or delete on each chosen import, one at a time, and report what happened to every one. */
  async function runBulk(kind: "cancel" | "delete") {
    const targets = kind === "cancel" ? toCancel : toDelete;
    const skipped = kind === "cancel"
      ? shownSelected.filter((b) => b.status !== "CANCELLED" && cannotCancel(b))
      : [];
    setBulkConfirm(null);
    setBulkResult(null);
    const problems = skipped.map((b) => `${b.label ?? "Untitled import"}: skipped, it has registered employees${
      b.status === "PARTIALLY_REGISTERED" ? ". Open it and use Exclude remaining to stop the rest" : ""}`);
    let ok = 0;
    for (const [i, b] of targets.entries()) {
      setBulkProgress(`${kind === "cancel" ? "Cancelling" : "Deleting"} ${i + 1} of ${targets.length}…`);
      try {
        if (kind === "cancel") await EmsService.cancelOnboardingBatch(b.id, accessToken!);
        else await EmsService.deleteOnboardingBatch(b.id, accessToken!);
        ok++;
      } catch (e: any) {
        problems.push(`${b.label ?? "Untitled import"}: ${e?.message || "failed"}`);
      }
    }
    setBulkProgress(null);
    setSelected(new Set());
    setBulkResult({ done: `${ok} ${kind === "cancel" ? "cancelled" : "deleted"}`, problems });
    queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
  }
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

        {open.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Open imports</span>
            <span><span className="font-semibold text-emerald-700">{totals.registered}</span> <span className="text-slate-500">registered</span></span>
            <span><span className="font-semibold text-blue-700">{totals.ready}</span> <span className="text-slate-500">ready to register</span></span>
            <button type="button" onClick={() => setFilter("attentionOnly", true)} disabled={totals.attention === 0}
              className="hover:underline disabled:no-underline disabled:cursor-default" title="Show imports with rows needing attention">
              <span className="font-semibold text-amber-700">{totals.attention}</span> <span className="text-slate-500">need attention</span>
            </button>
            {totals.unchecked > 0 && (
              <span><span className="font-semibold text-slate-700">{totals.unchecked}</span> <span className="text-slate-500">import{totals.unchecked === 1 ? "" : "s"} not yet checked</span></span>
            )}
          </div>
        )}

        {allBatches.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="relative min-w-52 flex-1">
                <span className="sr-only">Search imports</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
                  placeholder="Search name, file or uploader"
                  className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value as StatusFilter)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                <option value="ACTIVE">All except cancelled</option>
                <option value="ALL">All, including cancelled</option>
                {(Object.keys(BATCH_STATUS_LABELS) as OnboardingBatchStatus[]).map((st) => (
                  <option key={st} value={st}>{BATCH_STATUS_LABELS[st]}</option>
                ))}
              </select>
              {uploaders.length > 1 && (
                <select aria-label="Uploaded by" value={filters.uploader} onChange={(e) => setFilter("uploader", e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                  <option value="">Anyone</option>
                  {uploaders.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              )}
              <label className="inline-flex items-center gap-1.5 text-slate-600">
                <input type="checkbox" checked={filters.emptyOnly} onChange={(e) => setFilter("emptyOnly", e.target.checked)} /> Empty (0 records)
              </label>
              <label className="inline-flex items-center gap-1.5 text-slate-600">
                <input type="checkbox" checked={filters.attentionOnly} onChange={(e) => setFilter("attentionOnly", e.target.checked)} /> Needs attention
              </label>
              <label className="inline-flex items-center gap-1 text-slate-600">From
                <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs" />
              </label>
              <label className="inline-flex items-center gap-1 text-slate-600">To
                <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs" />
              </label>
              {filtersOn && (
                <button type="button" onClick={() => setFilters(NO_FILTERS)} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                  <X className="h-3.5 w-3.5" /> Clear filters
                </button>
              )}
              <span className="ml-auto inline-flex items-center gap-2 text-slate-500">
                {filtersOn && <span>Showing {batches.length} of {allBatches.length}</span>}
                {allBatches.length > 1 && <>
                  <label htmlFor="imports-sort" className="font-medium">Sort by</label>
                  <select id="imports-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    {SORTS.filter((s) => s.key !== "updated" || canSortByUpdated).map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </>}
              </span>
            </div>

            {shownSelected.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-950">
                <span className="font-semibold">{shownSelected.length} selected</span>
                {toCancel.length > 0 && (
                  <button type="button" disabled={!!bulkProgress} onClick={() => setBulkConfirm("cancel")}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50">
                    <Ban className="h-3.5 w-3.5" /> Cancel {toCancel.length}
                  </button>
                )}
                {toDelete.length > 0 && (
                  <button type="button" disabled={!!bulkProgress} onClick={() => setBulkConfirm("delete")}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> Delete {toDelete.length} cancelled
                  </button>
                )}
                {toCancel.length === 0 && toDelete.length === 0 && (
                  <span className="text-blue-900">Registered imports can’t be cancelled or deleted. To stop a partly registered import, open it and use Exclude remaining.</span>
                )}
                <button type="button" onClick={() => setSelected(new Set())} className="ml-auto font-medium text-blue-800 hover:underline">Clear selection</button>
              </div>
            )}
            {bulkProgress && (
              <p role="status" className="flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {bulkProgress}</p>
            )}
            {bulkResult && (
              <div role="status" className={`rounded-lg px-3 py-2 text-xs ${bulkResult.problems.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-900"}`}>
                <span className="font-semibold">{bulkResult.done}</span>
                {bulkResult.problems.length > 0 && <>
                  <span> · {bulkResult.problems.length} not done:</span>
                  <ul className="mt-1 list-disc pl-5">{bulkResult.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                </>}
                <button type="button" onClick={() => setBulkResult(null)} className="ml-2 underline">Dismiss</button>
              </div>
            )}
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
                    <th className="w-10 pl-5 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all shown imports"
                        checked={allShownTicked}
                        ref={(el) => { if (el) el.indeterminate = someShownTicked; }}
                        onChange={toggleAllShown}
                        disabled={batches.length === 0}
                      />
                    </th>
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
                      className={`transition-colors cursor-pointer ${selected.has(batch.id) ? "bg-blue-50/60 hover:bg-blue-50" : "hover:bg-slate-50"}`}
                    >
                      {/* The tick box must not also open the row. */}
                      <td className="w-10 pl-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${batch.label ?? "this import"}`}
                          checked={selected.has(batch.id)}
                          onChange={() => toggle(batch.id)}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-slate-300" />
                          <div>
                            <p className="font-medium text-slate-800">{batch.label ?? "Untitled import"}</p>
                            {batch.sourceFileName && (
                              <p className="text-xs text-slate-400">{batch.sourceFileName}</p>
                            )}
                            {batch.status !== "CANCELLED" && copiesOf(batch) > 1 && (
                              <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                                title="Other open imports use the same file name. If it's the same sheet, cancel the extra copies.">
                                Same file in {copiesOf(batch)} open imports
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><RecordBreakdown batch={batch} /></td>
                      <td className="px-4 py-3">
                        <BatchStatusPill status={batch.status} />
                        {(() => {
                          const step = nextStep(batch);
                          return step && <p className={`mt-1 text-xs font-medium ${step.tone}`}>{step.text}</p>;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{batch.uploadedBy?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {(() => {
                          const t = when(batch.createdAt);
                          return <><p className="text-slate-600">{t.at}</p><p className="text-slate-400">{t.ago}</p></>;
                        })()}
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
                              onClick={() => { setBulkResult(null); setConfirming({ kind: cannotCancel(batch) ? "blocked" : "cancel", batch }); }}
                              disabled={cancel.isPending}
                              title={cannotCancel(batch) ? "Can’t cancel: employees from this import are registered" : "Cancel this import"}
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
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">
                        {allBatches.length === 0 ? "No imports yet." : (
                          <>No imports match these filters. <button type="button" onClick={() => setFilters(NO_FILTERS)} className="font-medium text-blue-600 hover:underline">Clear filters</button></>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {cancelledCount > 0 && (filters.status === "ACTIVE" || filters.status === "CANCELLED") && (
            <div className="px-5 py-3 border-t border-slate-100">
              <button
                onClick={() => setFilter("status", filters.status === "CANCELLED" ? "ACTIVE" : "CANCELLED")}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                {filters.status === "CANCELLED" ? "Hide cancelled" : `Show ${cancelledCount} cancelled`}
              </button>
            </div>
          )}
        </div>
      </div>

      {bulkConfirm && (() => {
        const list = bulkConfirm === "cancel" ? toCancel : toDelete;
        const records = list.reduce((n, b) => n + b._count.records, 0);
        const count = `${list.length} import${list.length === 1 ? "" : "s"}`;
        return (
          <ConfirmDialog
            open
            title={bulkConfirm === "cancel" ? `Cancel ${count}?` : `Delete ${count} permanently?`}
            message={(bulkConfirm === "cancel"
              ? `Their ${records} records won't be registered. You can delete them afterwards.`
              : `Their ${records} records will be removed and can't be recovered.`)
              + (list.length <= 8 ? `\n\n${list.map((b) => `• ${b.label ?? "Untitled import"}`).join("\n")}` : "")}
            keepLabel={bulkConfirm === "cancel" ? "Keep them" : "Keep them"}
            confirmLabel={bulkConfirm === "cancel" ? `Cancel ${count}` : `Delete ${count}`}
            onConfirm={() => void runBulk(bulkConfirm)}
            onClose={() => setBulkConfirm(null)}
          />
        );
      })()}

      {confirming?.kind === "blocked" && (() => {
        const { batch } = confirming;
        const name = batch.label ?? "this import";
        const registered = batch.statusCounts?.REGISTERED ?? 0;
        const remaining = (["READY", "NEEDS_FIXING", "DRAFT"] as const).reduce((n, key) => n + (batch.statusCounts?.[key] ?? 0), 0);
        const people = (n: number) => `${n} employee${n === 1 ? " is" : "s are"}`;
        const partial = batch.status === "PARTIALLY_REGISTERED" && remaining > 0;
        return (
          <ConfirmDialog
            open
            title={`"${name}" can’t be cancelled`}
            message={partial
              ? `${people(registered)} already registered from this import, so it can’t be cancelled.\n\nTo stop the other ${remaining} record${remaining === 1 ? "" : "s"}, open the import and use “Exclude remaining”. Registered employees are kept.`
              : `Every record in this import is already registered or excluded, so there is nothing left to cancel.`}
            keepLabel="Close"
            confirmLabel={partial ? "Open import" : "View import"}
            onConfirm={() => { setConfirming(null); router.push(`/ems/onboarding/${batch.id}`); }}
            onClose={() => setConfirming(null)}
          />
        );
      })()}

      {confirming && confirming.kind !== "blocked" && (() => {
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
