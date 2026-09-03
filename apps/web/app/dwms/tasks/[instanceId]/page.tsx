"use client";

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsActivityItem,
  type DwmsTaskInstanceDetailResponse,
  type DwmsTaskInstanceEvent,
  type DwmsTaskItem,
} from "@/services/dwms.service";
import {
  ArrowLeft,
  CalendarClock,
  History,
  MessageSquare,
  Paperclip,
  Send,
  UserRound,
  Workflow,
} from "lucide-react";
import {
  ActivityRelationChain,
  buildActivityChains,
} from "../../components/ActivityRelationChain";

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status?: string | null) {
  return String(status ?? "PENDING")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function eventLabel(event: DwmsTaskInstanceEvent) {
  switch (event.type) {
    case "SUBMITTED_FOR_APPROVAL":
      return "Submitted for approval";
    case "APPROVED":
      return "Approved";
    case "DISAPPROVED":
      return "Rejected";
    case "COMMENT_ADDED":
      return "Comment added";
    case "STATUS_CHANGED":
      return "Status changed";
    default:
      return statusLabel(event.type);
  }
}

function DetailPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function TaskDetailContent() {
  const params = useParams<{ instanceId: string }>();
  const router = useRouter();
  const instanceId = params.instanceId;
  const [detail, setDetail] = useState<DwmsTaskInstanceDetailResponse | null>(
    null,
  );
  const [activities, setActivities] = useState<DwmsActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const response = await DwmsService.getTaskInstanceDetail(token, instanceId);
      const activityResponse = await DwmsService.getActivities(token).catch(() => ({ activities: [] }));
      setDetail(response);
      setActivities(activityResponse.activities ?? []);
    } catch (loadError: unknown) {
      setError(getDwmsErrorMessage(loadError, "Failed to load task details"));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (instanceId) void loadDetail();
  }, [instanceId, loadDetail]);

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = comment.trim();
    if (!text) return;
    setSavingComment(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.addTaskComment(token, instanceId, text);
      setComment("");
      setIsCommentOpen(false);
      await loadDetail();
    } catch (commentError: unknown) {
      setError(getDwmsErrorMessage(commentError, "Failed to add comment"));
    } finally {
      setSavingComment(false);
    }
  }

  const task: DwmsTaskItem | null = detail?.task ?? null;
  const hasFullDetailAccess = detail?.access !== "relation";
  const events = useMemo(
    () => detail?.events ?? task?.events ?? [],
    [detail?.events, task?.events],
  );
  const currentActivity = useMemo(() => {
    if (!task?.activity) return null;
    return activities.find((activity) => activity.id === task.activity?.id) ?? task.activity;
  }, [activities, task?.activity]);
  const activityChains = useMemo(
    () => currentActivity ? buildActivityChains(currentActivity, activities) : [],
    [activities, currentActivity],
  );
  const relationTaskInstanceByActivityId = useMemo(() => {
    const byActivityId = new Map<string, { instanceId: string; status: string }>();
    if (task?.activity?.id) {
      byActivityId.set(task.activity.id, {
        instanceId: task.instanceId,
        status: task.status,
      });
    }
    for (const related of detail?.relatedTaskInstances ?? []) {
      byActivityId.set(related.activityId, {
        instanceId: related.instanceId,
        status: String(related.status),
      });
    }
    return byActivityId;
  }, [detail?.relatedTaskInstances, task]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-24 text-center text-sm text-slate-500">
          Loading task details...
        </div>
      ) : !task ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-24 text-center text-sm text-slate-500">
          Task instance was not found.
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                    {statusLabel(task.status)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                    {statusLabel(task.frequency)}
                  </span>
                  {hasFullDetailAccess && task.requiresCompletionDocument && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                      Document required
                    </span>
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                    {task.title}
                  </h1>
                  {task.description && (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Progress</span>
                  <span className="font-semibold text-slate-800">
                    {task.completionPercent}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width:
                        Math.min(100, Math.max(0, task.completionPercent)) +
                        "%",
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {currentActivity && activityChains.length > 0 && (
            <DetailPanel
              title="Task Dependencies"
              icon={<Workflow className="h-4 w-4 text-blue-600" />}
            >
              <div className="space-y-4">
                {activityChains.map((chain, index) => (
                  <ActivityRelationChain
                    key={`${chain.map((item) => item.id).join("-")}-${index}`}
                    chain={chain}
                    currentActivityId={currentActivity.id}
                    mode="instance"
                    getItemHref={(item) => {
                      const relatedInstance = relationTaskInstanceByActivityId.get(item.id);
                      return relatedInstance ? `/dwms/tasks/${relatedInstance.instanceId}` : null;
                    }}
                    getItemStatus={(item) => relationTaskInstanceByActivityId.get(item.id)?.status}
                  />
                ))}
              </div>
            </DetailPanel>
          )}

          <DetailPanel
            title="Task Information"
            icon={<CalendarClock className="h-4 w-4 text-blue-600" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoItem label="Scheduled for" value={formatDateTime(task.scheduledFor)} />
              <InfoItem label="Due at" value={formatDateTime(task.dueAt)} />
              <InfoItem label="Completed at" value={formatDateTime(task.completedAt)} />
              {task.wasOverdue && (
                <InfoItem
                  label="Overdue history"
                  value={
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Was Overdue
                    </span>
                  }
                />
              )}
              <InfoItem label="Department" value={task.department?.name ?? "Not set"} />
              <InfoItem label="Owner" value={task.owner?.name ?? "Not set"} />
              <InfoItem label="Assigned by" value={task.assignedBy?.name ?? "Not set"} />
              <InfoItem label="Approver" value={task.approvedBy?.name ?? "Not set"} />
              {hasFullDetailAccess && (
                <InfoItem
                  label="Required document"
                  value={
                    task.completionDocumentName ??
                    (task.requiresCompletionDocument ? "Required" : "Optional")
                  }
                />
              )}
            </div>

            {hasFullDetailAccess && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Completion Evidence
                </p>
                {task.completionNote ? (
                  <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
                    {task.completionNote}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No completion note has been submitted.
                  </p>
                )}
                {task.completionAttachmentUrl && (
                  <a
                    href={task.completionAttachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {task.completionAttachmentName || "View completion file"}
                  </a>
                )}
              </div>
            )}
          </DetailPanel>

          {hasFullDetailAccess && (
            <DetailPanel title="History" icon={<History className="h-4 w-4 text-slate-700" />}>
            <div className="space-y-4">
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No history events have been recorded yet.
                </p>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="relative border-l border-slate-200 pl-4">
                    <span className="absolute -left-[7px] top-1 inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500" />
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {eventLabel(event)}
                        </h3>
                        <span className="text-xs text-slate-500">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1">
                          <UserRound className="h-3 w-3" />
                          {event.actor?.name ?? "System"}
                        </span>
                        {(event.fromStatus || event.toStatus) && (
                          <span className="rounded-full bg-white px-2 py-1">
                            {event.fromStatus ? statusLabel(event.fromStatus) : "None"} to {event.toStatus ? statusLabel(event.toStatus) : "None"}
                          </span>
                        )}
                      </div>
                      {event.note && (
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {event.note}
                        </p>
                      )}
                      {event.attachmentUrl && (
                        <a
                          href={event.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-800"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {event.attachmentName || "View attachment"}
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            </DetailPanel>
          )}

          {hasFullDetailAccess && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {!isCommentOpen ? (
              <button
                type="button"
                onClick={() => setIsCommentOpen(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                <MessageSquare className="h-4 w-4" />
                Add Comment
              </button>
            ) : (
              <form onSubmit={handleCommentSubmit} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add a comment..."
                  className="min-h-10 flex-1 rounded-full border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsCommentOpen(false);
                    setComment("");
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingComment || !comment.trim()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  {savingComment ? "Adding..." : "Add Comment"}
                </button>
              </form>
            )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function TaskInstanceDetailPage() {
  return (
    <ProtectedRoute>
      <TaskDetailContent />
    </ProtectedRoute>
  );
}

