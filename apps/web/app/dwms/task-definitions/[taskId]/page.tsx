"use client";

import { useUrlViewState } from "@/hooks/useUrlViewState";
import { enumParam, pageParam, dateParam } from "@/lib/url-view-state";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { DwmsService, getDwmsErrorMessage } from "@/services/dwms.service";
import { formatOrganizationDate } from "../../utils/organizationDate";
import DwmsSelectDropdown from "../../components/DwmsSelectDropdown";
import DwmsDatePicker from "../../components/DwmsDatePicker";

const statuses = [
  "PENDING",
  "IN_PROGRESS",
  "PARTLY_DONE",
  "LESS_THAN_50",
  "OVERDUE",
  "APPROVAL_PENDING",
  "DONE",
  "NOT_APPLICABLE",
];
const instanceViewSchema = {
  page: pageParam,
  status: enumParam(["", ...statuses], ""),
  date: dateParam,
};
const label = (value: string) =>
  value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function TaskPage() {
  const router = useRouter();
  const { taskId } = useParams<{ taskId: string }>();
  const token = useAuthStore((state) => state.accessToken);
  const {
    state: view,
    update: updateView,
    ready,
  } = useUrlViewState("instances", instanceViewSchema);
  const { page, status, date: instanceDate } = view;
  const setPage = (page: number) => updateView({ page });
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["dwms-task-definition", taskId, page, status, instanceDate],
    queryFn: () =>
      DwmsService.getTaskDefinitionDetail(
        token!,
        taskId,
        page,
        status,
        instanceDate,
      ),
    enabled: ready && !!token && !!taskId,
  });
  const date = (value: string) =>
    formatOrganizationDate(value, data?.organizationTimeZone, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) || "—";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-indigo-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      {error ? (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 p-5 text-sm text-rose-700"
        >
          {getDwmsErrorMessage(error, "Unable to load task.")}{" "}
          <button onClick={() => void refetch()} className="underline">
            Retry
          </button>
        </div>
      ) : isPending ? (
        <p role="status">Loading task…</p>
      ) : (
        data && (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Task details
                  </p>
                  <h1 className="mt-2 break-words text-xl font-semibold text-slate-900 sm:text-2xl">
                    {data.task.title}
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {label(data.task.frequency)}
                    {data.task.activity ? ` · ${data.task.activity.code}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  {data.task.isActive ? "Active" : "Archived"}
                </span>
              </div>
              <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {data.task.description || "No description provided."}
              </p>
              <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
                {[
                  ["Owner", data.task.owner?.name],
                  ["Assigned by", data.task.assignedBy?.name],
                  ["Approver", data.task.approvedBy?.name],
                ].map(([name, value]) => (
                  <div key={name}>
                    <dt className="text-xs text-slate-500">{name}</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">
                      {value || "Not assigned"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section
              aria-label="Task instances"
              aria-busy={isFetching}
              className="rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                    <CalendarClock className="h-5 w-5 text-indigo-600" /> Task
                    instances{" "}
                    <span className="rounded bg-slate-100 px-2 text-xs text-slate-600">
                      {data.pagination.total}
                    </span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Dated occurrences, newest first. Open an instance for its
                    details, evidence, and comments.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <div className="w-full sm:w-48">
                    <p className="mb-1 text-xs text-slate-500">Instance date</p>
                    <DwmsDatePicker
                      value={instanceDate}
                      timeZone={data.organizationTimeZone}
                      onChange={(value) => {
                        updateView({ date: value, page: 1 });
                      }}
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <p className="mb-1 text-xs text-slate-500">Status</p>
                    <DwmsSelectDropdown
                      value={status}
                      onChange={(value) => {
                        updateView({ status: value, page: 1 });
                      }}
                      options={[
                        { value: "", label: "All statuses" },
                        ...statuses.map((value) => ({
                          value,
                          label: label(value),
                        })),
                      ]}
                      placeholder="All statuses"
                      ariaLabel="Instance status"
                    />
                  </div>
                </div>
              </div>
              {!data.instances.length ? (
                <p
                  role="status"
                  className="p-8 text-center text-sm text-slate-500"
                >
                  {status || instanceDate
                    ? "No instances match these filters."
                    : "No instances have been generated for this task yet."}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.instances.map((instance) => (
                    <Link
                      key={instance.instanceId}
                      href={`/dwms/tasks/${instance.instanceId}`}
                      className="flex flex-col gap-3 p-5 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {date(instance.scheduledFor)}
                        </h3>
                        <p className="mt-1 break-words text-sm text-slate-600">
                          {instance.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Due {date(instance.dueAt)}
                          {instance.completedAt
                            ? ` · Completed ${date(instance.completedAt)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${instance.status === "DONE" ? "bg-emerald-50 text-emerald-700" : instance.isOverdue ? "bg-rose-50 text-rose-700" : instance.status === "APPROVAL_PENDING" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"}`}
                        >
                          {instance.status === "APPROVAL_PENDING"
                            ? "Awaiting approval"
                            : instance.isOverdue
                              ? "Overdue"
                              : label(instance.status)}
                        </span>
                        <span className="text-xs tabular-nums text-slate-500">
                          {instance.completionPercent}% complete
                        </span>
                        <span className="text-xs font-medium text-indigo-700">
                          View instance →
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 rounded-b-xl bg-slate-50 p-4 text-xs text-slate-600">
                <span aria-live="polite">
                  {data.pagination.total
                    ? `Showing ${(page - 1) * 20 + 1}–${Math.min(page * 20, data.pagination.total)} of ${data.pagination.total} instances`
                    : "0 instances"}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    aria-label="Previous page"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage(page - 1)}
                    className="rounded-lg border border-slate-200 bg-white p-2 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span>
                    Page {page} of {data.pagination.pages}
                  </span>
                  <button
                    aria-label="Next page"
                    disabled={page >= data.pagination.pages || isFetching}
                    onClick={() => setPage(page + 1)}
                    className="rounded-lg border border-slate-200 bg-white p-2 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>
          </>
        )
      )}
    </main>
  );
}

export default function Page() {
  return (
    <ProtectedRoute>
      <TaskPage />
    </ProtectedRoute>
  );
}
