"use client";

import { type ElementType, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
} from "lucide-react";
import {
  DwmsService,
  type DwmsAlertItem,
  type DwmsAllocatedRoutineTask,
  type DwmsPaginationMeta,
  type DwmsTaskItem,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import { formatOrganizationDate } from "../utils/organizationDate";
import EmployeeActivityManager from "./EmployeeActivityManager";

type EmployeeDwmsPanelProps = {
  employeeId: string;
  accessToken: string;
  jobTitle?: string | null;
  canManageActivities: boolean;
  showApplicableActivities?: boolean;
};

function formatDate(iso: string | null | undefined, timeZone?: string | null) {
  if (!iso) return "-";
  return (
    formatOrganizationDate(iso, timeZone, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) ?? "-"
  );
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
  return <div className="p-4 text-sm text-slate-500 sm:p-5">{children}</div>;
}

function PaginationControls({
  pagination,
  onPageChange,
}: {
  pagination?: DwmsPaginationMeta;
  onPageChange: (page: number) => void;
}) {
  if (!pagination || pagination.totalItems === 0) return null;

  const firstItem = (pagination.page - 1) * pagination.pageSize + 1;
  const lastItem = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalItems,
  );

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">
        Showing {firstItem}-{lastItem} of {pagination.totalItems} tasks
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-20 text-center text-xs font-semibold text-slate-600">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TaskList({
  tasks,
  timeZone,
  onOpen,
}: {
  tasks?: DwmsTaskItem[];
  timeZone?: string | null;
  onOpen: (task: DwmsTaskItem) => void;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {tasks?.length ? (
        tasks.map((task) => (
          <button
            key={task.instanceId}
            type="button"
            onClick={() => onOpen(task)}
            className="w-full p-4 text-left transition-colors hover:bg-slate-50"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-900">
                  {task.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Due{" "}
                  {formatDate(
                    task.dueAt,
                    task.organizationTimeZone || timeZone,
                  )}{" "}
                  - {task.frequency}
                </p>
              </div>
              <span className="w-fit shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                {task.status.replace(/_/g, " ")}
              </span>
            </div>
          </button>
        ))
      ) : (
        <EmptyState>No current DWMS tasks.</EmptyState>
      )}
    </div>
  );
}

function RoutineTaskList({ tasks }: { tasks?: DwmsAllocatedRoutineTask[] }) {
  return (
    <div className="divide-y divide-slate-100">
      {tasks?.length ? (
        tasks.map((task) => {
          const category =
            task.taskCategory === "GOOD_PRACTICE"
              ? "Good Practice"
              : "Job Responsibility";

          return (
            <div key={task.taskId} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-slate-900">
                    {task.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {task.activity?.code ? `${task.activity.code} · ` : ""}
                    {String(task.frequency).replace(/_/g, " ")}
                  </p>
                </div>
                <span className="w-fit shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                  {category}
                </span>
              </div>
            </div>
          );
        })
      ) : (
        <EmptyState>No routine work allocated to this employee.</EmptyState>
      )}
    </div>
  );
}

function AlertList({
  alerts,
  emptyMessage,
  tone,
  meta,
  onOpen,
}: {
  alerts?: DwmsAlertItem[];
  emptyMessage: string;
  tone: "rose" | "amber" | "blue";
  meta: (alert: DwmsAlertItem) => string;
  onOpen: (alert: DwmsAlertItem) => void;
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
          <button
            key={alert.id}
            type="button"
            onClick={() => onOpen(alert)}
            className="w-full p-4 text-left transition-colors hover:bg-slate-50"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-900">
                  {alert.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">{meta(alert)}</p>
              </div>
              <span
                className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeClass}`}
              >
                {alert.isAbnormality ? "Abnormality" : alert.pendingAcknowledgments ? "Not Acknowledged" : "Acknowledged"}
              </span>
            </div>
          </button>
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
  canManageActivities,
  showApplicableActivities = true,
}: EmployeeDwmsPanelProps) {
  const router = useRouter();
  const [pages, setPages] = useState({
    routineWork: 1,
    assignedTasks: 1,
    currentAlerts: 1,
    abnormalities: 1,
  });
  const organizationTimeZone = useAuthStore(
    (state) => state.user?.organizationTimeZone,
  );

  const { data: dwmsProfile, isLoading: dwmsProfileLoading } = useQuery({
    queryKey: [
      "dwms-employee-profile",
      employeeId,
      pages.routineWork,
      pages.assignedTasks,
      pages.currentAlerts,
      pages.abnormalities,
    ],
    queryFn: () =>
      DwmsService.getEmployeeDwmsProfile(accessToken, employeeId, {
        routinePage: pages.routineWork,
        assignedPage: pages.assignedTasks,
        currentAlertPage: pages.currentAlerts,
        abnormalityPage: pages.abnormalities,
      }),
    placeholderData: (previousData) => previousData,
    enabled: !!accessToken && !!employeeId,
  });

  const changePage = (section: keyof typeof pages, page: number) => {
    setPages((current) => ({ ...current, [section]: page }));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["routineWork", "Routine Work", dwmsProfile?.counts?.routineWork ?? 0],
          ["assignedTasks", "Assigned Tasks", dwmsProfile?.counts?.assignedTasks ?? 0],
          ["currentAlerts", "Alerts", dwmsProfile?.counts?.currentAlerts ?? 0],
          ["abnormalities", "Abnormalities", dwmsProfile?.counts?.abnormalities ?? 0],
        ] as const).map(([section, label, value]) => (
          <div
            key={section}
            className="min-w-0 rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-sm sm:p-4"
          >
            <p className="break-words text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[11px]">
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
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <CardHeader
                icon={ClipboardList}
                title="Routine Work"
                iconColor="text-indigo-500"
                iconBg="bg-indigo-50"
              />
              <RoutineTaskList tasks={dwmsProfile?.routineWork} />
              <PaginationControls
                pagination={dwmsProfile?.pagination?.routineWork}
                onPageChange={(page) => changePage("routineWork", page)}
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <CardHeader
                icon={ClipboardList}
                title="Assigned Tasks"
                iconColor="text-indigo-500"
                iconBg="bg-indigo-50"
              />
              <TaskList
                tasks={dwmsProfile?.assignedTasks}
                timeZone={organizationTimeZone}
                onOpen={(task) => router.push(`/dwms/tasks/${task.instanceId}`)}
              />
              <PaginationControls
                pagination={dwmsProfile?.pagination?.assignedTasks}
                onPageChange={(page) => changePage("assignedTasks", page)}
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
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
                  `${alert.severity} - ${formatDate(alert.createdAt, organizationTimeZone)}`
                }
                onOpen={(alert) => router.push(`/dwms/alerts/${alert.id}`)}
              />
              <PaginationControls
                pagination={dwmsProfile?.pagination?.abnormalities}
                onPageChange={(page) => changePage("abnormalities", page)}
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <CardHeader
                icon={AlertTriangle}
                title="Alerts"
                iconColor="text-rose-500"
                iconBg="bg-rose-50"
              />
              <AlertList
                alerts={dwmsProfile?.currentAlerts}
                emptyMessage="No alerts assigned to this employee."
                tone="rose"
                meta={(alert) =>
                  `${alert.severity} - ${formatDate(alert.createdAt, organizationTimeZone)}`
                }
                onOpen={(alert) => router.push(`/dwms/alerts/${alert.id}`)}
              />
              <PaginationControls
                pagination={dwmsProfile?.pagination?.currentAlerts}
                onPageChange={(page) => changePage("currentAlerts", page)}
              />
            </div>
          </div>

          {showApplicableActivities && (
            <EmployeeActivityManager
              key={employeeId}
              employeeId={employeeId}
              accessToken={accessToken}
              canManageActivities={canManageActivities}
              pageSize={5}
            />
          )}
        </>
      )}
    </div>
  );
}
