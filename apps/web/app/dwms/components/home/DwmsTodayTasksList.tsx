"use client";

import TaskCompletionDialog from "./TaskCompletionDialog";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsTaskStatus,
} from "@/services/dwms.service";
import TaskCompactRow from "./TaskCompactRow";
import { uploadImage } from "@/services/uploads.service";

type Props = {
  maxItems?: number;
};

const statusCompletion: Record<DwmsTaskStatus, number> = {
  PENDING: 0,
  IN_PROGRESS: 20,
  PARTLY_DONE: 50,
  DONE: 100,
  APPROVAL_PENDING: 100,
  LESS_THAN_50: 10,
  NOT_APPLICABLE: 0,
  OVERDUE: 0,
};

export const TODAY_TASKS_QUERY_KEY = ["dwms-today-tasks"] as const;

/** Today's tasks plus the open (not done) ones, earliest due first. */
export function useOpenTodayTasks(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const query = useQuery({
    queryKey: TODAY_TASKS_QUERY_KEY,
    queryFn: () => DwmsService.getTodayTasks(accessToken!),
    enabled: enabled && !!accessToken,
  });
  const openTasks = useMemo(() => {
    return [...(query.data?.tasks ?? [])]
      .filter((task) => task.status !== "DONE")
      .sort((a, b) => {
        const dueA = new Date(a.dueAt).getTime();
        const dueB = new Date(b.dueAt).getTime();
        return (Number.isNaN(dueA) ? 0 : dueA) - (Number.isNaN(dueB) ? 0 : dueB);
      });
  }, [query.data]);
  return { ...query, tasks: query.data?.tasks ?? [], openTasks };
}

/** Compact list of today's DWMS tasks with inline status changes; rendered inside the dashboard's My day panel. */
export default function DwmsTodayTasksList({ maxItems = 3 }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { tasks, openTasks, isLoading: loading, error: loadError } = useOpenTodayTasks();
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [completionTask, setCompletionTask] = useState<{
    instanceId: string;
    status: DwmsTaskStatus;
    requiresCompletionDocument: boolean;
    completionDocumentName?: string | null;
  } | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [completionFile, setCompletionFile] = useState<File | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);

  async function reloadTasks() {
    await queryClient.invalidateQueries({ queryKey: TODAY_TASKS_QUERY_KEY });
  }

  async function handleStatusChange(instanceId: string, nextStatus: DwmsTaskStatus) {
    if (nextStatus === "DONE") {
      const task = tasks.find((item) => item.instanceId === instanceId);
      setCompletionTask({
        instanceId,
        status: nextStatus,
        requiresCompletionDocument: !!task?.requiresCompletionDocument,
        completionDocumentName: task?.completionDocumentName ?? null,
      });
      setCompletionNote("");
      setCompletionFile(null);
      setCompletionError(null);
      setError(null);
      return;
    }

    if (!accessToken) return;

    setSavingId(instanceId);
    setError(null);
    try {
      await DwmsService.updateTaskStatus(accessToken, instanceId, {
        status: nextStatus,
        completionPercent: statusCompletion[nextStatus],
      });
      await reloadTasks();
    } catch (err: unknown) {
      setError(getDwmsErrorMessage(err, "Failed to update task status."));
    } finally {
      setSavingId(null);
    }
  }

  async function handleAcknowledgement(taskId: string) {
    if (!accessToken) return;

    setSavingId(taskId);
    setError(null);
    try {
      await DwmsService.acknowledgeTask(accessToken, taskId);
      await reloadTasks();
    } catch (err: unknown) {
      setError(getDwmsErrorMessage(err, "Failed to acknowledge task."));
    } finally {
      setSavingId(null);
    }
  }

  async function handleCompletionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completionTask || !accessToken) return;
    if (completionTask.requiresCompletionDocument && !completionFile) {
      setCompletionError("Completion document is required for this task.");
      return;
    }

    setSavingId(completionTask.instanceId);
    setCompletionError(null);
    setError(null);
    try {
      const upload = completionFile
        ? await uploadImage(completionFile, "dwms/task-completions", accessToken)
        : null;
      await DwmsService.updateTaskStatus(accessToken, completionTask.instanceId, {
        status: completionTask.status,
        completionPercent: statusCompletion[completionTask.status],
        completionNote: completionNote.trim() || null,
        completionAttachmentUrl: upload?.fileUrl ?? null,
        completionAttachmentName: completionFile?.name ?? null,
      });
      setCompletionTask(null);
      setCompletionNote("");
      setCompletionFile(null);
      setCompletionError(null);
      await reloadTasks();
    } catch (err: unknown) {
      setCompletionError(getDwmsErrorMessage(err, "Failed to complete task."));
    } finally {
      setSavingId(null);
    }
  }

  if (!accessToken) return null;

  const visibleTasks = openTasks.slice(0, maxItems);
  const shownError = error ?? (loadError ? getDwmsErrorMessage(loadError, "Failed to load today's tasks.") : null);

  return (
    <div className="flex flex-col">
      {shownError && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{shownError}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-8 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : visibleTasks.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">No tasks due today.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {visibleTasks.map((task) => (
              <TaskCompactRow
                key={task.instanceId}
                task={task}
                onOpen={() => router.push(`/dwms/tasks/${task.instanceId}`)}
                onStatusChange={handleStatusChange}
                onAcknowledgement={handleAcknowledgement}
                saving={savingId === task.instanceId || savingId === task.taskId}
              />
            ))}
          </ul>
          {openTasks.length > visibleTasks.length && (
            <button
              type="button"
              onClick={() => router.push("/dwms")}
              className="border-t border-slate-100 px-4 py-2 text-left text-xs text-slate-500 transition hover:text-slate-900"
            >
              +{openTasks.length - visibleTasks.length} more tasks
            </button>
          )}
        </>
      )}
      {completionTask && (
        <TaskCompletionDialog
          task={completionTask}
          note={completionNote}
          file={completionFile}
          error={completionError}
          saving={!!savingId}
          onNoteChange={setCompletionNote}
          onFileChange={setCompletionFile}
          onClose={() => {
            setCompletionTask(null);
            setCompletionError(null);
          }}
          onSubmit={handleCompletionSubmit}
        />
      )}
    </div>
  );
}
