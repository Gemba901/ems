"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import DwmsSearchFilterBar from "../components/DwmsSearchFilterBar";
import DwmsTabHeader from "../components/DwmsTabHeader";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsAlertItem,
} from "@/services/dwms.service";

const severities = [
  {
    value: "MEDIUM",
    label: "Medium",
    color:
      "bg-blue-50/50 text-blue-600 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-950/50",
  },
  {
    value: "HIGH",
    label: "High",
    color:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/35 dark:text-blue-300 dark:border-blue-900/50",
  },
  {
    value: "CRITICAL",
    label: "Critical",
    color:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/35 dark:text-indigo-400 dark:border-indigo-900/50",
  },
];

const statuses = [
  {
    value: "OPEN",
    label: "Open",
    color:
      "bg-blue-50/50 text-blue-700 border-blue-200 dark:bg-blue-950/25 dark:text-blue-400 dark:border-blue-900/30",
  },
  {
    value: "IN_PROGRESS",
    label: "In Progress",
    color:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/35 dark:text-sky-400 dark:border-sky-900/50",
  },
  {
    value: "ESCALATED",
    label: "Escalated",
    color:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/35 dark:text-violet-400 dark:border-violet-900/50",
  },
  {
    value: "CLOSED",
    label: "Closed",
    color:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-400 dark:border-emerald-900/50",
  },
];

type AlertTab =
  | "MY_ALERTS"
  | "ABNORMALITIES"
  | "DEPARTMENTAL"
  | "ORGANISATIONAL"
  | "OPENED_BY_ME";

export default function AlertsRoute() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen bg-bg-app p-8 text-center text-sm text-muted-app">
            Loading...
          </div>
        }
      >
        <AlertsPage />
      </Suspense>
    </ProtectedRoute>
  );
}

function AlertsPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const raiseParam = searchParams.get("raise");

  const [alerts, setAlerts] = useState<DwmsAlertItem[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [actioningAlertId, setActioningAlertId] = useState<string | null>(null);
  const [actionText, setActionText] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [activeTab, setActiveTab] = useState<AlertTab>("MY_ALERTS");



  function formatDate(val: string) {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(val));
  }

  async function loadAlerts() {
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const res = await DwmsService.getAlerts(token);
      setAlerts(res?.alerts ?? []);
      if (res?.employeeId) {
        setEmployeeId(res.employeeId);
      }
    } catch (err: unknown) {
      setError(getDwmsErrorMessage(err, "Failed to load alerts."));
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void loadAlerts();
  }, []);

  useEffect(() => {
    if (raiseParam === "true") {
      router.replace("/dwms/actions/new?mode=alert");
    }
  }, [raiseParam, router]);

  async function handleActionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actioningAlertId || !actionText.trim()) return;

    setSubmittingAction(true);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const isDirectCloser =
        user?.roleLevel === "HOD" ||
        user?.roleLevel === "MANAGEMENT";
      const action = isDirectCloser
        ? DwmsService.closeAlert
        : DwmsService.requestAlertClosure;
      await action(token, actioningAlertId, {
        closureNote: actionText,
      });
      setActioningAlertId(null);
      setActionText("");
      await loadAlerts();
    } catch (err: unknown) {
      alert(getDwmsErrorMessage(err, "Failed to submit action"));
    } finally {
      setSubmittingAction(false);
    }
  }

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const alertSeverity =
        alert.severity === "LOW" ? "MEDIUM" : alert.severity;
      const matchSeverity =
        severityFilter === "ALL" || alertSeverity === severityFilter;
      const matchStatus =
        statusFilter === "ALL" || alert.status === statusFilter;
      const text =
        `${alert.title} ${alert.description} ${alert.raisedBy?.name || ""} ${alert.againstUser?.name || ""} ${alert.department?.name || ""}`.toLowerCase();
      const matchSearch =
        searchTerm.trim() === "" || text.includes(searchTerm.toLowerCase());
      return matchSeverity && matchStatus && matchSearch;
    });
  }, [alerts, severityFilter, statusFilter, searchTerm]);


  const tabFilteredAlerts = useMemo(() => {
    return filteredAlerts.filter((alert) => {
      if (activeTab === "ABNORMALITIES") {
        return !!alert.isAbnormality;
      }

      if (alert.isAbnormality) {
        return false;
      }
      const isMyAlert =
        alert.againstUserId === employeeId ||
        alert.againstUserId === user?.userId ||
        alert.taskInstance?.owner?.id === employeeId ||
        alert.taskInstance?.owner?.id === user?.userId;

      if (activeTab === "MY_ALERTS") {
        return isMyAlert;
      }
      if (activeTab === "DEPARTMENTAL") return !!alert.departmentId;
      if (activeTab === "ORGANISATIONAL")
        return (
          !alert.departmentId && !alert.againstUserId && !alert.taskInstanceId
        );
      if (activeTab === "OPENED_BY_ME") {
        const raiserId = alert.raisedBy?.id;
        return raiserId === employeeId || raiserId === user?.userId;
      }
      return true;
    });
  }, [activeTab, filteredAlerts, employeeId, user]);

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <DwmsTabHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { key: "MY_ALERTS", label: "My Alerts", dotColor: "bg-blue-500" },
          {
            key: "ABNORMALITIES",
            label: "Abnormalities",
            dotColor: "bg-rose-500",
          },
          {
            key: "DEPARTMENTAL",
            label: "Department Alerts",
            dotColor: "bg-violet-500",
          },
          {
            key: "ORGANISATIONAL",
            label: "Organization Alerts",
            dotColor: "bg-emerald-500",
          },
          {
            key: "OPENED_BY_ME",
            label: "Opened by Me",
            dotColor: "bg-slate-400",
          },
        ]}
        rightContent={
          <button
            type="button"
            onClick={() => router.push("/dwms/actions/new?mode=alert")}
            className="mb-2 inline-flex h-10 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-full border border-transparent bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            Raise New Alert
          </button>
        }
      />
      <div className="space-y-6">
        <DwmsSearchFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search title, person, department..."
          filters={[
            {
              key: "status",
              value: statusFilter,
              onChange: setStatusFilter,
              ariaLabel: "Status filter",
              widthClassName: "md:w-56",
              options: [
                { value: "ALL", label: "All Statuses" },
                ...statuses.map((status) => ({
                  value: status.value,
                  label: status.label,
                })),
              ],
            },
            {
              key: "severity",
              value: severityFilter,
              onChange: setSeverityFilter,
              ariaLabel: "Severity filter",
              widthClassName: "md:w-56",
              options: [
                { value: "ALL", label: "All Severities" },
                ...severities.map((severity) => ({
                  value: severity.value,
                  label: severity.label,
                })),
              ],
            },
          ]}
        />

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-16 text-center text-sm text-muted-app">
            Loading alerts...
          </div>
        ) : tabFilteredAlerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-16 text-center text-sm text-muted-app">
            No alerts found in this section.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {tabFilteredAlerts.map((alert) => {
              const alertSeverity =
                alert.severity === "LOW" ? "MEDIUM" : alert.severity;
              const severityConfig = severities.find(
                (severity) => severity.value === alertSeverity,
              );
              const statusConfig = statuses.find(
                (status) => status.value === alert.status,
              );
              const isCurrentViewerTarget =
                alert.againstUserId === employeeId ||
                alert.againstUserId === user?.userId ||
                alert.taskInstance?.owner?.id === employeeId ||
                alert.taskInstance?.owner?.id === user?.userId;

              return (
                <div
                  key={alert.id}
                  onClick={() => router.push(`/dwms/alerts/${alert.id}`)}
                  className="group relative cursor-pointer rounded-2xl border border-border-app bg-white p-5 shadow-sm transition hover:border-accent-app/40 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-app pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-lg border px-2.5 py-0.5 text-xs font-medium ${severityConfig?.color || ""}`}
                      >
                        {alertSeverity}
                      </span>
                      <span
                        className={`rounded-lg border px-2.5 py-0.5 text-xs font-medium ${statusConfig?.color || ""}`}
                      >
                        {statusConfig?.label || alert.status}
                      </span>
                      {alert.isAbnormality && (
                        <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-400">
                          Abnormality
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-app">
                      {formatDate(alert.createdAt)}
                    </span>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-base font-semibold text-text-app">
                      {alert.title}
                    </h3>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-app">
                      {alert.description}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {alert.taskInstance && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-app bg-white px-3 py-1.5 text-xs font-medium text-text-app">
                        Task:{" "}
                        <span className="font-semibold">
                          {alert.taskInstance.task.title}
                        </span>
                      </span>
                    )}
                    {alert.againstUser && !isCurrentViewerTarget && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
                        To Person:{" "}
                        <span className="font-semibold">
                          {alert.againstUser.name}
                        </span>
                        <span className="text-blue-500 dark:text-blue-400">
                          ({alert.againstUser.email})
                        </span>
                      </span>
                    )}
                    {alert.department && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-300">
                        To Department:{" "}
                        <span className="font-semibold">
                          {alert.department.name}
                        </span>
                      </span>
                    )}
                  </div>

                  {alert.correctiveAction && (
                    <div className="mt-4 rounded-r-lg border-l-2 border-accent-app bg-white p-3">
                      <p className="text-xs font-semibold text-accent-app">
                        Corrective Action Taken
                      </p>
                      <p className="mt-1 text-xs text-text-app/90">
                        {alert.correctiveAction}
                      </p>
                    </div>
                  )}

                  <div
                    className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border-app pt-3"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="text-xs text-muted-app">
                      Raised by:{" "}
                      <span className="font-semibold text-text-app">
                        {alert.raisedBy?.name}
                      </span>
                      <span className="ml-1 opacity-60">
                        ({alert.raisedBy?.email})
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      {(alert.status === "OPEN" ||
                        alert.status === "IN_PROGRESS") &&
                        actioningAlertId !== alert.id &&
                        (() => {
                          const isManager =
                            user?.roleLevel === "HOD" ||
                            user?.roleLevel === "MANAGEMENT";
                          const isTaskOwner =
                            alert.againstUserId === employeeId ||
                            alert.againstUserId === user?.userId ||
                            alert.taskInstance?.owner?.id === employeeId ||
                            alert.taskInstance?.owner?.id === user?.userId;

                          const closurePending = alert.closureApprovalStatus === "PENDING";
                          if (closurePending || (!isManager && !isTaskOwner)) return null;

                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setActioningAlertId(alert.id);
                                setActionText("");
                              }}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-zinc-50 transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                            >
                              {isManager ? "Close Alert" : "Request Closure"}
                            </button>
                          );
                        })()}
                    </div>
                  </div>

                  {actioningAlertId === alert.id && (
                    <form
                      onSubmit={handleActionSubmit}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-4 space-y-3 border-t border-border-app pt-4"
                    >
                      <label className="block text-xs font-semibold text-text-app">
                        Enter closure / resolution comments:
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder="Describe how it was resolved..."
                        className="w-full rounded-xl border border-border-app bg-bg-app px-3 py-2 text-xs text-text-app transition focus:outline-none focus:ring-2 focus:ring-accent-app/20"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActioningAlertId(null);
                            setActionText("");
                          }}
                          className="rounded-lg border border-border-app bg-panel-app px-3 py-1.5 text-xs text-text-app transition hover:bg-bg-app"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingAction}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-zinc-50 transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                        >
                          {submittingAction ? "Submitting..." : "Submit"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
</div>
  );
}







