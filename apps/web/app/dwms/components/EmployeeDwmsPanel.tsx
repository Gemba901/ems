"use client";

import { type ElementType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  ClipboardList,
  Loader2,
} from "lucide-react";
import {
  DwmsService,
  type EmployeeActivityAssignmentStatus,
  type DwmsAlertItem,
  type DwmsTaskItem,
} from "@/services/dwms.service";

type EmployeeDwmsPanelProps = {
  employeeId: string;
  accessToken: string;
  jobTitle?: string | null;
  canManageActivities: boolean;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CardHeader({
  icon: Icon,
  title,
  iconColor = "text-indigo-500",
  iconBg = "bg-indigo-50",
}: {
  icon: ElementType;
  title: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2.5">
      <div className={`p-1.5 rounded-lg ${iconBg}`}>
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="p-5 text-sm text-slate-500">{children}</div>;
}

function TaskList({ tasks }: { tasks?: DwmsTaskItem[] }) {
  return (
    <div className="divide-y divide-slate-100">
      {tasks?.length ? (
        tasks.map((task) => (
          <div key={task.instanceId} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {task.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Due {formatDate(task.dueAt)} - {task.frequency}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                {task.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        ))
      ) : (
        <EmptyState>No current DWMS tasks.</EmptyState>
      )}
    </div>
  );
}

function AlertList({
  alerts,
  emptyMessage,
  tone,
  meta,
}: {
  alerts?: DwmsAlertItem[];
  emptyMessage: string;
  tone: "rose" | "amber" | "blue";
  meta: (alert: DwmsAlertItem) => string;
}) {
  const badgeClass =
    tone === "rose"
      ? "bg-rose-50 text-rose-600"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-blue-50 text-blue-700";

  return (
    <div className="divide-y divide-slate-100">
      {alerts?.length ? (
        alerts.map((alert) => (
          <div key={alert.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {alert.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">{meta(alert)}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeClass}`}
              >
                {alert.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        ))
      ) : (
        <EmptyState>{emptyMessage}</EmptyState>
      )}
    </div>
  );
}

export default function EmployeeDwmsPanel({
  employeeId,
  accessToken,
  jobTitle,
  canManageActivities,
}: EmployeeDwmsPanelProps) {
  const queryClient = useQueryClient();

  const { data: dwmsProfile, isLoading: dwmsProfileLoading } = useQuery({
    queryKey: ["dwms-employee-profile", employeeId],
    queryFn: () => DwmsService.getEmployeeDwmsProfile(accessToken, employeeId),
    enabled: !!accessToken && !!employeeId,
  });

  const { data: roleActivities, isLoading: roleActivitiesLoading } = useQuery({
    queryKey: ["dwms-employee-role-activities", employeeId, jobTitle],
    queryFn: () => DwmsService.getEmployeeRoleActivities(accessToken, employeeId),
    enabled: !!accessToken && !!employeeId && !!jobTitle,
  });

  const activityStatusMutation = useMutation({
    mutationFn: ({
      activityId,
      status,
    }: {
      activityId: string;
      status: EmployeeActivityAssignmentStatus;
    }) =>
      DwmsService.updateEmployeeActivityStatus(
        accessToken,
        employeeId,
        activityId,
        status,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dwms-employee-profile", employeeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dwms-employee-role-activities", employeeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["calendar-employee-stats", employeeId],
      });
    },
  });

  const activeActivityCount =
    roleActivities?.activities?.filter((item) => item.status === "ACTIVE")
      .length ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Current Tasks", dwmsProfile?.counts?.currentTasks ?? 0],
          ["Current Alerts", dwmsProfile?.counts?.currentAlerts ?? 0],
          ["Abnormalities", dwmsProfile?.counts?.abnormalities ?? 0],
          ["Raised Alerts", dwmsProfile?.counts?.raisedAlerts ?? 0],
          [
            "Activities",
            dwmsProfile?.counts?.applicableActivities ??
              roleActivities?.count ??
              0,
          ],
          [
            "Active Activities",
            dwmsProfile?.counts?.activeActivities ?? activeActivityCount,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {value}
            </p>
          </div>
        ))}
      </div>

      {dwmsProfileLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white py-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading DWMS data...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader
                icon={ClipboardList}
                title="Current Tasks"
                iconColor="text-indigo-500"
                iconBg="bg-indigo-50"
              />
              <TaskList tasks={dwmsProfile?.currentTasks} />
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader
                icon={AlertTriangle}
                title="Current Alerts"
                iconColor="text-rose-500"
                iconBg="bg-rose-50"
              />
              <AlertList
                alerts={dwmsProfile?.currentAlerts}
                emptyMessage="No current alerts assigned to this employee."
                tone="rose"
                meta={(alert) =>
                  `${alert.severity} - ${formatDate(alert.createdAt)}`
                }
              />
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader
                icon={Bell}
                title="Abnormalities"
                iconColor="text-amber-500"
                iconBg="bg-amber-50"
              />
              <AlertList
                alerts={dwmsProfile?.abnormalities}
                emptyMessage="No open abnormalities for this employee."
                tone="amber"
                meta={(alert) =>
                  `${alert.severity} - ${formatDate(alert.createdAt)}`
                }
              />
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader
                icon={Bell}
                title="Raised Alerts"
                iconColor="text-blue-500"
                iconBg="bg-blue-50"
              />
              <AlertList
                alerts={dwmsProfile?.raisedAlerts}
                emptyMessage="No open alerts raised by this employee."
                tone="blue"
                meta={(alert) =>
                  `Against ${
                    alert.againstUser?.name ??
                    alert.taskInstance?.owner?.name ??
                    "General"
                  } - ${formatDate(alert.createdAt)}`
                }
              />
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <CardHeader
              icon={Activity}
              title="Applicable Activities"
              iconColor="text-blue-500"
              iconBg="bg-blue-50"
            />
            <div className="p-5 space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {jobTitle || "No job title"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Activities linked to this job title stay inactive until an
                    admin activates them for this employee.
                  </p>
                </div>
                {roleActivities?.count !== undefined && (
                  <span className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {roleActivities.count} activities
                  </span>
                )}
              </div>

              {!jobTitle ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Add a job title in Master Data to show applicable DWMS
                  activities.
                </div>
              ) : roleActivitiesLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                  activities...
                </div>
              ) : !roleActivities?.activities?.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No DWMS activities are linked to this job title yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {roleActivities.activities.map(({ activity, status }) => {
                    const nextStatus: EmployeeActivityAssignmentStatus =
                      status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                    const isUpdating =
                      activityStatusMutation.isPending &&
                      activityStatusMutation.variables?.activityId ===
                        activity.id;

                    return (
                      <div
                        key={activity.id}
                        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {activity.name}
                            </p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                              {activity.frequency}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {activity.code}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                              status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {status === "ACTIVE" ? "Active" : "Inactive"}
                          </span>
                          {canManageActivities && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() =>
                                activityStatusMutation.mutate({
                                  activityId: activity.id,
                                  status: nextStatus,
                                })
                              }
                              className={`inline-flex min-w-24 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                                status === "ACTIVE"
                                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  : "bg-blue-600 text-white hover:bg-blue-700"
                              }`}
                            >
                              {isUpdating && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              )}
                              {status === "ACTIVE" ? "Deactivate" : "Activate"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
