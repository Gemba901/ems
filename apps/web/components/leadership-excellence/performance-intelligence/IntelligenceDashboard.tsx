"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRight,
  Download,
  Filter,
  Loader2,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  IntelligenceApiError,
  IntelligenceReportingService,
  intelligenceQuery,
  type IntelligenceFilters,
  type IntelligenceView,
} from "@/services/leadership-excellence/performance-intelligence/reporting";
import {
  PLANNING_DATE_MAX,
  PLANNING_DATE_MIN,
  planningPeriodBounds,
  planningPeriodLabel,
  planningPeriodValidation,
} from "@/services/leadership-excellence/performance-planning/planning-period";
import { calendarDateLabel } from "@/services/leadership-excellence/calendar-display";
import { useLexPlanningPeriod } from "../LexPlanningPeriod";
import {
  Button,
  card,
  control,
  ErrorList,
  Field,
} from "../performance-planning/PlanningUi";
import {
  DeliveryTables,
  IntelligenceMetrics,
  intelligenceTime,
  MeasureDetail,
  MeasureTable,
} from "./IntelligenceContent";
import { printIntelligenceReport } from "./report-print";

const BASE = "/leadership-excellence/performance-intelligence";
const alignmentNames: Record<string, string> = {
  Q: "Quality",
  C: "Cost",
  D: "Delivery",
  S: "Safety",
  M: "Morale",
  T: "Technology",
  OTHER: "Business focus",
};
type FilterDraft = {
  startDate: string;
  endDate: string;
  departmentId: string;
  personId: string;
  pillar: string;
  alignment: string;
  search: string;
};
const emptyDraft: FilterDraft = {
  startDate: "",
  endDate: "",
  departmentId: "",
  personId: "",
  pillar: "",
  alignment: "",
  search: "",
};

function readFilters(search: URLSearchParams): IntelligenceFilters {
  const filters: IntelligenceFilters = {};
  for (const key of [
    "startDate",
    "endDate",
    "departmentId",
    "personId",
    "search",
  ] as const) {
    const value = search.get(key);
    if (value) filters[key] = value;
  }
  const pillar = search.get("pillar");
  if (pillar && ["LEX", "PEX", "OPX", "CMX", "SGEX", "FPEX"].includes(pillar))
    filters.pillar = pillar as IntelligenceFilters["pillar"];
  const alignment = search.get("alignment");
  if (alignment && Object.hasOwn(alignmentNames, alignment))
    filters.alignment = alignment as IntelligenceFilters["alignment"];
  const scope = search.get("scope");
  if (scope && ["MY", "DEPARTMENT", "ORGANIZATION"].includes(scope))
    filters.scope = scope as IntelligenceFilters["scope"];
  return filters;
}

export function IntelligenceDashboard({
  report = false,
}: {
  report?: boolean;
}) {
  const user = useAuthStore((state) => state.user);
  const search = useSearchParams();
  // A changed tenant, actor or permission scope gets fresh local filters and dialogs.
  return (
    <IntelligenceWorkspace
      key={JSON.stringify([
        user?.organizationId,
        user?.userId,
        user?.roleLevel,
        user?.roleId,
        user?.departmentId,
        report,
        search.toString(),
      ])}
      report={report}
    />
  );
}

function IntelligenceWorkspace({ report }: { report: boolean }) {
  const token = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const { cycle: sharedCycle, setCycle } = useLexPlanningPeriod();
  const [cycleOverride, setCycleOverride] = useState<string | undefined>(() => {
    const requested = search.get("cycle");
    return requested === "" || (requested && planningPeriodBounds(requested))
      ? requested
      : undefined;
  });
  const cycle = cycleOverride ?? sharedCycle;
  useEffect(() => {
    if (cycleOverride !== undefined) setCycle(cycleOverride);
  }, [cycleOverride, setCycle]);
  const [applied, setApplied] = useState<IntelligenceFilters>(() =>
    readFilters(new URLSearchParams(search.toString())),
  );
  const [draft, setDraft] = useState<FilterDraft>(() => ({
    ...emptyDraft,
    ...readFilters(new URLSearchParams(search.toString())),
  }));
  const [filterError, setFilterError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const exportRequest = useRef<AbortController | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const filters = useMemo(
    () => ({ ...applied, cycle: cycle || undefined }),
    [applied, cycle],
  );
  const queryKey = useMemo(
    () => [
      "lex-intelligence",
      user?.organizationId,
      user?.userId,
      user?.roleLevel,
      user?.roleId,
      user?.departmentId,
      report ? "reports" : "dashboard",
      filters,
    ],
    [
      user?.organizationId,
      user?.userId,
      user?.roleLevel,
      user?.roleId,
      user?.departmentId,
      report,
      filters,
    ],
  );
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      IntelligenceReportingService.getView(
        token!,
        report ? "reports" : "dashboard",
        filters,
        signal,
      ),
    enabled: !!token && !!user?.organizationId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    // Preserve filter choices while refreshing; old report rows are never rendered for new filters.
    placeholderData: keepPreviousData,
    retry: (count, error) =>
      !(
        error instanceof IntelligenceApiError &&
        [400, 401, 403].includes(error.status)
      ) && count < 2,
  });
  useEffect(() => {
    if (!user?.organizationId || typeof BroadcastChannel === "undefined")
      return;
    const channels = [
      "gemba-performance-planning",
      "gemba-performance-execution",
    ].map((name) => {
      const channel = new BroadcastChannel(name);
      channel.onmessage = (event) => {
        if (event.data?.organizationId === user.organizationId)
          void queryClient.invalidateQueries({ queryKey, exact: true });
      };
      return channel;
    });
    return () => channels.forEach((channel) => channel.close());
  }, [queryClient, queryKey, user?.organizationId]);
  useEffect(() => () => exportRequest.current?.abort(), [queryKey]);

  const denied =
    query.error instanceof IntelligenceApiError &&
    [401, 403].includes(query.error.status);
  const data =
    token && !query.isPlaceholderData && !denied ? query.data : undefined;
  const options = denied ? undefined : query.data?.options;
  const selected =
    data &&
    [...data.kpis, ...data.measuredResults].find(
      (measure) => measure.key === selectedKey,
    );
  const periods = [
    ...new Set([...(options?.cycles || []), ...(cycle ? [cycle] : [])]),
  ]
    .sort()
    .reverse();
  const activeFilterCount = Object.values({
    ...applied,
    scope: undefined,
  }).filter(Boolean).length;
  const formBusy = !token;
  const exportDisabled =
    !data || query.isFetching || query.isError || downloading;

  function updateDraft<K extends keyof FilterDraft>(
    key: K,
    value: FilterDraft[K],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "departmentId" ? { personId: "" } : {}),
    }));
  }
  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.startDate || draft.endDate) {
      const errors = planningPeriodValidation(
        draft.startDate || PLANNING_DATE_MIN,
        draft.endDate || PLANNING_DATE_MAX,
      );
      if (errors.length) {
        setFilterError(errors.join("\n"));
        return;
      }
    }
    setFilterError("");
    setSelectedKey(null);
    setDownloadError("");
    setApplied({
      scope: applied.scope,
      startDate: draft.startDate || undefined,
      endDate: draft.endDate || undefined,
      departmentId: draft.departmentId || undefined,
      personId: draft.personId || undefined,
      pillar: (draft.pillar as IntelligenceFilters["pillar"]) || undefined,
      alignment:
        (draft.alignment as IntelligenceFilters["alignment"]) || undefined,
      search: draft.search.trim() || undefined,
    });
  }
  async function downloadCsv() {
    if (!token || !user || exportDisabled) return;
    const controller = new AbortController();
    exportRequest.current?.abort();
    exportRequest.current = controller;
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await IntelligenceReportingService.exportCsv(
        token,
        filters,
        controller.signal,
      );
      const currentUser = useAuthStore.getState().user;
      if (
        controller.signal.aborted ||
        !currentUser ||
        currentUser.organizationId !== user.organizationId ||
        currentUser.userId !== user.userId ||
        currentUser.roleLevel !== user.roleLevel ||
        currentUser.roleId !== user.roleId ||
        currentUser.departmentId !== user.departmentId
      )
        return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `performance-intelligence-${data?.today || "report"}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted)
        setDownloadError(
          error instanceof Error
            ? error.message
            : "The CSV could not be downloaded. Please try again.",
        );
    } finally {
      if (exportRequest.current === controller) {
        exportRequest.current = null;
        setDownloading(false);
      }
    }
  }
  function printReport() {
    if (!reportRef.current || exportDisabled) return;
    setDownloadError("");
    try {
      printIntelligenceReport(reportRef.current);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "The report could not be printed.",
      );
    }
  }

  return (
    <div className="space-y-5 text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Area 07 · Performance intelligence
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {report ? "Performance reports" : "Performance dashboard"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {report
              ? "Review and export the same approved measures, source periods and verified results shown on your dashboard."
              : "Follow approved targets, verified results and delivery needs across your permitted scope."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={query.isFetching || !token}
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              size={16}
              className={query.isFetching ? "animate-spin" : ""}
            />
            Refresh
          </Button>
          {report ? (
            <>
              <Button
                variant="outline"
                disabled={exportDisabled}
                onClick={printReport}
              >
                <Printer size={16} />
                Print report
              </Button>
              <Button
                disabled={exportDisabled}
                onClick={() => void downloadCsv()}
              >
                {downloading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                Download CSV
              </Button>
            </>
          ) : (
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`${BASE}/reports?${intelligenceQuery({ ...filters, cycle })}`}
                  prefetch={false}
                />
              }
            >
              View reports <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </header>

      <section className={`${card} !p-4`} aria-label="Report filters">
        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
          <Field label="Planning period">
            <select
              className={control}
              value={cycle}
              disabled={formBusy}
              onChange={(event) => {
                setCycleOverride(event.target.value);
                setCycle(event.target.value);
                setSelectedKey(null);
                setDownloadError("");
              }}
            >
              <option value="">All approved periods</option>
              {periods.map((period) => (
                <option key={period} value={period}>
                  {planningPeriodLabel(period)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="View">
            <select
              className={control}
              value={applied.scope || query.data?.filters.scope || ""}
              disabled={formBusy}
              onChange={(event) => {
                const scope = (event.target.value ||
                  undefined) as IntelligenceFilters["scope"];
                setApplied((current) => ({
                  ...current,
                  scope,
                  departmentId: undefined,
                  personId: undefined,
                }));
                setDraft((current) => ({
                  ...current,
                  departmentId: "",
                  personId: "",
                }));
                setSelectedKey(null);
                setDownloadError("");
              }}
            >
              {(!query.data || denied) && (
                <option value="">Use my permitted scope</option>
              )}
              <option value="MY">My performance</option>
              {query.data?.access.canViewDepartment && (
                <option value="DEPARTMENT">My department</option>
              )}
              {query.data?.access.canViewOrganization && (
                <option value="ORGANIZATION">Organization</option>
              )}
            </select>
          </Field>
          {report && (
            <Link
              href={`${BASE}/dashboards?${intelligenceQuery({ ...filters, cycle })}`}
              prefetch={false}
              className="pb-2 text-sm font-medium text-indigo-700 hover:underline"
            >
              Back to dashboard
            </Link>
          )}
        </div>
        <details className="mt-4 border-t border-slate-100 pt-4">
          <summary className="w-fit cursor-pointer text-sm font-medium text-slate-600 marker:text-slate-400">
            <Filter size={14} className="mx-1 inline" />
            More filters
            {activeFilterCount > 0 ? ` (${activeFilterCount} applied)` : ""}
          </summary>
          <form onSubmit={applyFilters} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="From date">
                <input
                  type="date"
                  className={control}
                  value={draft.startDate}
                  min={PLANNING_DATE_MIN}
                  max={draft.endDate || PLANNING_DATE_MAX}
                  onChange={(event) =>
                    updateDraft("startDate", event.target.value)
                  }
                />
              </Field>
              <Field label="To date">
                <input
                  type="date"
                  className={control}
                  value={draft.endDate}
                  min={draft.startDate || PLANNING_DATE_MIN}
                  max={PLANNING_DATE_MAX}
                  onChange={(event) =>
                    updateDraft("endDate", event.target.value)
                  }
                />
              </Field>
              <Field label="Department">
                <select
                  className={control}
                  value={draft.departmentId}
                  onChange={(event) =>
                    updateDraft("departmentId", event.target.value)
                  }
                >
                  <option value="">All accessible departments</option>
                  {options?.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Person">
                <select
                  className={control}
                  value={draft.personId}
                  onChange={(event) =>
                    updateDraft("personId", event.target.value)
                  }
                >
                  <option value="">All accessible people</option>
                  {options?.people
                    .filter(
                      (person) =>
                        !draft.departmentId ||
                        person.departmentId === draft.departmentId,
                    )
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Excellence pillar">
                <select
                  className={control}
                  value={draft.pillar}
                  onChange={(event) =>
                    updateDraft("pillar", event.target.value)
                  }
                >
                  <option value="">All pillars</option>
                  {options?.pillars.map((pillar) => (
                    <option key={pillar.code} value={pillar.code}>
                      {pillar.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="QCDSMT result area">
                <select
                  className={control}
                  value={draft.alignment}
                  onChange={(event) =>
                    updateDraft("alignment", event.target.value)
                  }
                >
                  <option value="">All result areas</option>
                  {options?.alignments.map((alignment) => (
                    <option key={alignment} value={alignment}>
                      {alignmentNames[alignment] || alignment}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Search">
                  <input
                    type="search"
                    className={control}
                    value={draft.search}
                    maxLength={200}
                    placeholder="KPI, goal, action or support request"
                    onChange={(event) =>
                      updateDraft("search", event.target.value)
                    }
                  />
                </Field>
              </div>
            </div>
            <ErrorList error={filterError} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={formBusy}>
                Apply filters
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft(emptyDraft);
                  setApplied({ scope: applied.scope });
                  setFilterError("");
                  setSelectedKey(null);
                  setDownloadError("");
                }}
              >
                Clear optional filters
              </Button>
            </div>
          </form>
        </details>
      </section>

      <ErrorList error={downloadError} />
      {query.isPending || query.isPlaceholderData || !token ? (
        <div
          role="status"
          className="flex min-h-60 items-center justify-center gap-3 text-slate-500"
        >
          <Loader2 size={20} className="animate-spin" />
          Loading performance intelligence…
        </div>
      ) : !data ? (
        <section className={card}>
          <p
            role="alert"
            className="mb-4 whitespace-pre-line text-sm text-red-700"
          >
            {query.error?.message ||
              "Performance intelligence could not be loaded."}
          </p>
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw size={16} />
            Try again
          </Button>
        </section>
      ) : (
        <>
          {query.isError && (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              This report could not be refreshed. The displayed data is from{" "}
              {intelligenceTime(data.generatedAt)}. Refresh before printing or
              exporting.
            </p>
          )}
          <div ref={reportRef} className="space-y-5">
            <div data-report-filters className="space-y-2">
              {report && (
                <h2 className="text-lg font-semibold">
                  {user?.organizationName ? `${user.organizationName} · ` : ""}
                  Performance report
                </h2>
              )}
              <p className="text-xs leading-6 text-slate-600">
                <span className="font-medium">{data.access.scopeLabel}</span> ·{" "}
                {filterSummary(data)}
              </p>
              <p className="text-xs text-slate-500">
                Generated {intelligenceTime(data.generatedAt)} · Verified
                results only in actuals; missing values appear as —.
              </p>
            </div>
            <IntelligenceMetrics data={data} />
            <MeasureTable
              title="Assigned KPIs"
              description="Open a KPI for its approved definition, reporting periods and verification details. Values retain their own units."
              measures={data.kpis}
              onSelect={setSelectedKey}
            />
            <MeasureTable
              title="Company and goal measures"
              description="Independently recorded results for company and other approved goals."
              measures={data.measuredResults}
              onSelect={setSelectedKey}
            />
            <DeliveryTables data={data} />
            {data.notes.length > 0 && (
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold text-slate-700">
                  About this report
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-6 text-slate-500">
                  {data.notes.map((note, index) => (
                    <li key={`${index}-${note}`}>{note}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
      {selected && (
        <MeasureDetail
          measure={selected}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </div>
  );
}

function filterSummary(data: IntelligenceView): string {
  const { filters, options } = data;
  const labels = [
    filters.cycle ? planningPeriodLabel(filters.cycle) : "All approved periods",
  ];
  if (filters.startDate || filters.endDate)
    labels.push(
      `${filters.startDate ? calendarDateLabel(filters.startDate) : "Any start date"} – ${filters.endDate ? calendarDateLabel(filters.endDate) : "Any end date"}`,
    );
  if (filters.departmentId)
    labels.push(
      options.departments.find(
        (department) => department.id === filters.departmentId,
      )?.name || "Selected department",
    );
  if (filters.personId)
    labels.push(
      options.people.find((person) => person.id === filters.personId)?.name ||
        "Selected person",
    );
  if (filters.pillar)
    labels.push(
      options.pillars.find((pillar) => pillar.code === filters.pillar)?.name ||
        filters.pillar,
    );
  if (filters.alignment)
    labels.push(alignmentNames[filters.alignment] || filters.alignment);
  if (filters.search) labels.push(`Search: ${filters.search}`);
  return labels.join(" · ");
}
