"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useId, useState } from "react";
import { useUrlViewState } from "@/hooks/useUrlViewState";
import { enumParam, pageParam, textParam } from "@/lib/url-view-state";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  UserRound,
} from "lucide-react";
import { DwmsService, type DwmsPaginationMeta } from "@/services/dwms.service";
import EmployeeActivityManager from "./EmployeeActivityManager";
import { useAuthStore } from "@/store/auth.store";
import { formatOrganizationDate } from "../utils/organizationDate";

type EmployeeDwmsPanelProps = {
  employeeId: string;
  accessToken: string;
  jobTitle?: string | null;
  canManageActivities: boolean;
  showApplicableActivities?: boolean;
  persistView?: boolean;
};

const tabs = [
  { key: "routineWork", label: "Good Practices", count: "goodPractices" },
  {
    key: "jobResponsibilities",
    label: "Job Responsibility",
    count: "jobResponsibilities",
  },
  { key: "assignedTasks", label: "Assigned Tasks", count: "assignedTasks" },
  { key: "currentAlerts", label: "Alerts", count: "currentAlerts" },
  { key: "abnormalities", label: "Abnormalities", count: "abnormalities" },
] as const;
type Tab = (typeof tabs)[number]["key"];
const workViewSchema = {
  tab: enumParam(
    tabs.map((item) => item.key),
    "routineWork",
  ),
  page: pageParam,
  search: textParam,
};

function Pagination({
  value,
  onChange,
}: {
  value?: DwmsPaginationMeta;
  onChange: (page: number) => void;
}) {
  if (!value?.totalItems) return null;
  const first = (value.page - 1) * value.pageSize + 1;
  const last = Math.min(value.page * value.pageSize, value.totalItems);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted px-4 py-3">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing {first}–{last} of {value.totalItems} items
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          type="button"
          aria-label="Previous page"
          disabled={value.page <= 1}
          onClick={() => onChange(value.page - 1)}
          className="rounded-lg border border-border bg-card p-2 text-muted-foreground disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {value.page} of {value.totalPages}
        </span>
        <Button
          variant="ghost"
          type="button"
          aria-label="Next page"
          disabled={value.page >= value.totalPages}
          onClick={() => onChange(value.page + 1)}
          className="rounded-lg border border-border bg-card p-2 text-muted-foreground disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function EmployeeDwmsPanel(props: EmployeeDwmsPanelProps) {
  // Reset local filters and selection when moving between employees.
  return <EmployeeWorkOverview key={props.employeeId} {...props} />;
}

function EmployeeWorkOverview({
  employeeId,
  accessToken,
  canManageActivities,
  showApplicableActivities = true,
  persistView = false,
}: EmployeeDwmsPanelProps) {
  const panelId = useId();
  const organizationTimeZone = useAuthStore(
    (state) => state.user?.organizationTimeZone,
  );
  const formatDate = (value: string) =>
    formatOrganizationDate(value, organizationTimeZone, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) ?? "—";
  const restored = useUrlViewState("work", workViewSchema, {
    key: "employee",
    value: employeeId,
  });
  const [localView, setLocalView] = useState<{
    tab: Tab;
    page: number;
    search: string;
  }>({ tab: "routineWork", page: 1, search: "" });
  const view = persistView ? restored.state : localView;
  const ready = !persistView || restored.ready;
  const updateView = (patch: Partial<typeof localView>) => {
    if (persistView) restored.update(patch);
    else setLocalView((current) => ({ ...current, ...patch }));
  };
  const { tab, page, search } = view;
  const setPage = (page: number) => updateView({ page });
  const [querySearch, setQuerySearch] = useState(search.trim());
  const activeTab = tabs.find((item) => item.key === tab)!;
  const isAllocation = tab === "routineWork" || tab === "jobResponsibilities";
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuerySearch(search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["dwms-employee-profile", employeeId, tab, page, querySearch],
    queryFn: () =>
      DwmsService.getEmployeeDwmsProfile(accessToken, employeeId, {
        routinePage: isAllocation ? page : 1,
        routineCategory:
          tab === "jobResponsibilities"
            ? "JOB_RESPONSIBILITY"
            : "GOOD_PRACTICE",
        assignedPage: tab === "assignedTasks" ? page : 1,
        currentAlertPage: tab === "currentAlerts" ? page : 1,
        abnormalityPage: tab === "abnormalities" ? page : 1,
        search: querySearch,
      }),
    enabled:
      ready && querySearch === search.trim() && !!accessToken && !!employeeId,
  });

  function selectTab(next: Tab) {
    updateView({ tab: next, page: 1, search: "" });
    setQuerySearch("");
  }
  const pagination = isAllocation
    ? data?.pagination?.routineWork
    : data?.pagination?.[
        tab as "assignedTasks" | "currentAlerts" | "abnormalities"
      ];
  const allocations = data?.routineWork ?? [];
  const assignedTasks = data?.assignedTasks ?? [];
  const alerts =
    (tab === "currentAlerts" ? data?.currentAlerts : data?.abnormalities) ?? [];
  const total = pagination?.totalItems ?? 0;
  const emptyMessage = querySearch
    ? "No matching items. Try another search."
    : isAllocation
      ? `No ${tab === "routineWork" ? "good practices" : "job responsibilities"} allocated to this employee.`
      : tab === "assignedTasks"
        ? "No assigned tasks."
        : tab === "currentAlerts"
          ? "No alerts assigned to this employee."
          : "No abnormalities recorded for this employee.";
  const rowClass =
    "flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between";
  const detailLabel = (
    <span className="shrink-0 text-xs font-medium text-info">
      View details →
    </span>
  );

  return (
    <div className="space-y-5">
      {data?.employee && (
        <section
          aria-label="Employee work overview"
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-info-subtle text-base font-semibold text-info sm:h-14 sm:w-14"
            >
              {data.employee.name
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Work overview
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="break-words text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {data.employee.name}
                </h2>
                {data.employee.employeeCode && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    ID {data.employee.employeeCode}
                  </span>
                )}
              </div>
              {(data.employee.jobTitle || data.employee.department?.name) && (
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {[data.employee.jobTitle, data.employee.department?.name]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-border pt-3 lg:w-64 lg:shrink-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <UserRound
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Reports to</p>
              <p
                className={`mt-0.5 break-words text-sm ${data.employee.reportingManager?.name ? "font-medium text-foreground" : "text-muted-foreground"}`}
              >
                {data.employee.reportingManager?.name ?? "Not assigned"}
              </p>
            </div>
          </div>
        </section>
      )}

      <section
        className="overflow-hidden rounded-xl border border-border bg-card"
        aria-label="Employee workload"
      >
        <div
          role="tablist"
          aria-label="Work categories"
          className="flex flex-wrap gap-1 border-b border-border p-3"
        >
          {tabs.map((item, index) => (
            <Button
              variant="ghost"
              key={item.key}
              id={`${panelId}-${item.key}`}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              aria-controls={`${panelId}-content`}
              tabIndex={tab === item.key ? 0 : -1}
              onClick={() => selectTab(item.key)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                        tabs.length;
                selectTab(tabs[next].key);
                document
                  .getElementById(`${panelId}-${tabs[next].key}`)
                  ?.focus();
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${tab === item.key ? "bg-info-subtle font-semibold text-info" : "text-muted-foreground hover:bg-muted"}`}
            >
              {item.label}
              <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                {data?.counts?.[item.count] ?? "—"}
              </span>
            </Button>
          ))}
        </div>
        <div
          id={`${panelId}-content`}
          role="tabpanel"
          aria-labelledby={`${panelId}-${tab}`}
          aria-busy={isFetching}
        >
          {
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {activeTab.label}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isAllocation
                      ? "Allocated responsibilities; completion is tracked on dated occurrences."
                      : tab === "assignedTasks"
                        ? "Assigned tasks; open a task to see its dated instances."
                        : "Reported items and acknowledgment status."}
                  </p>
                </div>
                <label className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 focus-within:ring-2 focus-within:ring-info sm:w-64">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    type="search"
                    aria-label={`Search ${activeTab.label}`}
                    placeholder="Search title or description"
                    value={search}
                    onChange={(event) =>
                      updateView({ search: event.target.value, page: 1 })
                    }
                    className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none sm:text-sm"
                  />
                </label>
              </div>
              {isError ? (
                <div role="alert" className="p-5 text-sm text-danger">
                  Unable to load employee work.{" "}
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => void refetch()}
                    className="underline"
                  >
                    Retry
                  </Button>
                </div>
              ) : !ready || querySearch !== search.trim() || isLoading ? (
                <div
                  role="status"
                  className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"
                >
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading work…
                </div>
              ) : (
                <>
                  {!total ? (
                    <p className="p-5 text-sm text-muted-foreground" role="status">
                      {emptyMessage}
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {isAllocation
                        ? allocations.map((task) => (
                            <Link
                              key={task.taskId}
                              href={`/dwms/task-definitions/${task.taskId}`}
                              className={rowClass}
                            >
                              <span className="min-w-0">
                                <span className="block break-words text-sm font-semibold text-foreground">
                                  {task.title}
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {task.frequency.replace(/_/g, " ")}
                                  {task.activity?.code
                                    ? ` · ${task.activity.code}`
                                    : ""}
                                </span>
                              </span>
                              {detailLabel}
                            </Link>
                          ))
                        : tab === "assignedTasks"
                          ? assignedTasks.map((task) => (
                              <Link
                                key={task.taskId}
                                href={`/dwms/task-definitions/${task.taskId}`}
                                className={rowClass}
                              >
                                <span className="min-w-0">
                                  <span className="block break-words text-sm font-semibold text-foreground">
                                    {task.title}
                                  </span>
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {task.frequency.replace(/_/g, " ")}
                                    {task.activity?.code
                                      ? ` � ${task.activity.code}`
                                      : ""}
                                  </span>
                                </span>
                                {detailLabel}
                              </Link>
                            ))
                          : alerts.map((alert) => (
                              <Link
                                key={alert.id}
                                href={`/dwms/alerts/${alert.id}`}
                                className={rowClass}
                              >
                                <span className="min-w-0">
                                  <span className="block break-words text-sm font-semibold text-foreground">
                                    {alert.title}
                                  </span>
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {alert.severity} ·{" "}
                                    {formatDate(alert.createdAt)}
                                  </span>
                                </span>
                                <span className="flex shrink-0 flex-wrap items-center gap-3">
                                  <span
                                    className={`rounded-full px-2 py-1 text-xs ${alert.pendingAcknowledgments ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success"}`}
                                  >
                                    {alert.pendingAcknowledgments
                                      ? "Not acknowledged"
                                      : "Acknowledged"}
                                  </span>
                                  {detailLabel}
                                </span>
                              </Link>
                            ))}
                    </div>
                  )}
                  <Pagination value={pagination} onChange={setPage} />
                </>
              )}
            </>
          }
        </div>
      </section>
      {showApplicableActivities && (
        <EmployeeActivityManager
          key={employeeId}
          employeeId={employeeId}
          accessToken={accessToken}
          canManageActivities={canManageActivities}
          pageSize={20}
        />
      )}
    </div>
  );
}
