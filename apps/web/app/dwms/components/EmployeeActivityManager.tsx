"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Loader2, X } from "lucide-react";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsEmployeeRoleActivityItem,
  type EmployeeActivityAssignmentStatus,
} from "@/services/dwms.service";

type EmployeeActivityManagerProps = {
  employeeId: string;
  accessToken: string;
  canManageActivities: boolean;
  pageSize?: number;
};

type Feedback = { tone: "success" | "error"; text: string } | null;

function scopeLabel(value?: string | null) {
  if (!value) return "Legacy activity";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EmployeeActivityManager({
  employeeId,
  accessToken,
  canManageActivities,
  pageSize = 5,
}: EmployeeActivityManagerProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pendingDeactivation, setPendingDeactivation] =
    useState<DwmsEmployeeRoleActivityItem | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dwms-employee-role-activities", employeeId],
    queryFn: () => DwmsService.getEmployeeRoleActivities(accessToken, employeeId),
    enabled: !!accessToken && !!employeeId,
  });

  const statusMutation = useMutation({
    mutationFn: ({
      item,
      status,
    }: {
      item: DwmsEmployeeRoleActivityItem;
      status: EmployeeActivityAssignmentStatus;
    }) =>
      DwmsService.updateEmployeeActivityStatus(
        accessToken,
        employeeId,
        item.activity.id,
        status,
      ),
    onSuccess: (result, variables) => {
      const isDeactivation = variables.status === "INACTIVE";
      const removed = result.removedFutureInstances ?? 0;
      setFeedback({
        tone: "success",
        text: isDeactivation
          ? `Deactivated “${variables.item.activity.name}”. Removed ${removed} not-started future task ${removed === 1 ? "instance" : "instances"}; existing history was preserved.`
          : `Activated “${variables.item.activity.name}”. Future routine work is enabled.`,
      });
      setPendingDeactivation(null);
      void queryClient.invalidateQueries({
        queryKey: ["dwms-employee-profile", employeeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["dwms-employee-role-activities", employeeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["calendar-employee-stats", employeeId],
      });
    },
    onError: (mutationError) => {
      setFeedback({
        tone: "error",
        text: getDwmsErrorMessage(mutationError, "Failed to update employee activity"),
      });
    },
  });

  const items = data?.activities ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = items.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const updateStatus = (
    item: DwmsEmployeeRoleActivityItem,
    status: EmployeeActivityAssignmentStatus,
  ) => {
    setFeedback(null);
    statusMutation.mutate({ item, status });
  };

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 rounded-xl bg-blue-50 p-2 text-blue-600">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Applicable Activities</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Current scoped activities and previously assigned activity history.
              </p>
            </div>
          </div>
          {data?.count !== undefined && (
            <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {data.count} activities
            </span>
          )}
        </div>

        {feedback && (
          <div
            className={`mx-4 mt-4 rounded-xl border p-3 text-xs ${
              feedback.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
            role="status"
          >
            {feedback.text}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading activities...
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {getDwmsErrorMessage(error, "Failed to load employee activities")}
          </div>
        ) : !items.length ? (
          <div className="m-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No DWMS activities apply to this employee yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Process</th>
                  <th className="px-5 py-3">Scope</th>
                  <th className="px-5 py-3">Frequency</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item) => {
                  const { activity, status } = item;
                  const isUpdating =
                    statusMutation.isPending &&
                    statusMutation.variables?.item.activity.id === activity.id;
                  return (
                    <tr key={activity.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{activity.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{activity.code}</p>
                        {activity.status === "ARCHIVED" && (
                          <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                            Master archived
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <p>{scopeLabel(activity.scope)}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {activity.scopeTarget || "All applicable employees"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {String(activity.frequency).replaceAll("_", " ")}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                            status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {canManageActivities && activity.status !== "ARCHIVED" ? (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => {
                              if (status === "ACTIVE") setPendingDeactivation(item);
                              else updateStatus(item, "ACTIVE");
                            }}
                            className={`inline-flex min-w-24 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                              status === "ACTIVE"
                                ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                : "bg-blue-600 text-white hover:bg-blue-700"
                            }`}
                          >
                            {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {status === "ACTIVE" ? "Deactivate" : "Activate"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Unavailable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">
              Showing {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, items.length)} of {items.length} activities
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {pendingDeactivation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !statusMutation.isPending) {
              setPendingDeactivation(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-activity-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="deactivate-activity-title" className="text-base font-bold text-slate-900">
                  Deactivate this activity?
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  <strong>{pendingDeactivation.activity.name}</strong> will stop generating routine work for this employee. Not-started task instances scheduled after today will be deleted; today’s work and existing history will be preserved.
                </p>
              </div>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => setPendingDeactivation(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close confirmation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => setPendingDeactivation(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => updateStatus(pendingDeactivation, "INACTIVE")}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
