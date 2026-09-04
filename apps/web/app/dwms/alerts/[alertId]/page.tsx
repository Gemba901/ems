"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsAlertComment,
  type DwmsAlertDetailResponse,
  type DwmsAlertItem,
} from "@/services/dwms.service";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Send,
  UserRound,
} from "lucide-react";

const severityTone: Record<string, string> = {
  LOW: "border-slate-200 bg-slate-50 text-slate-700",
  MEDIUM: "border-blue-200 bg-blue-50 text-blue-700",
  HIGH: "border-amber-200 bg-amber-50 text-amber-700",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
};

const statusTone: Record<string, string> = {
  OPEN: "border-blue-200 bg-blue-50 text-blue-700",
  IN_PROGRESS: "border-sky-200 bg-sky-50 text-sky-700",
  ESCALATED: "border-violet-200 bg-violet-50 text-violet-700",
  CLOSED: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function formatDateTime(value?: string | null, timeZone?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function label(value?: string | null) {
  return String(value ?? "").replace(/_/g, " ");
}

export default function AlertDetailRoute() {
  return (
    <ProtectedRoute>
      <AlertDetailPage />
    </ProtectedRoute>
  );
}

function AlertDetailPage() {
  const organizationTimeZone = useAuthStore(
    (state) => state.user?.organizationTimeZone,
  );
  const params = useParams<{ alertId: string }>();
  const router = useRouter();
  const alertId = params?.alertId;
  const [detail, setDetail] = useState<DwmsAlertDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [savingComment, setSavingComment] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!alertId) return;
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const response = await DwmsService.getAlertDetail(token, alertId);
      setDetail(response);
    } catch (loadError: unknown) {
      setError(getDwmsErrorMessage(loadError, "Failed to load alert details"));
    } finally {
      setLoading(false);
    }
  }, [alertId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = comment.trim();
    if (!alertId || !text) return;
    setSavingComment(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.addAlertComment(token, alertId, text);
      setComment("");
      setIsCommentOpen(false);
      await loadDetail();
    } catch (commentError: unknown) {
      setError(getDwmsErrorMessage(commentError, "Failed to add comment"));
    } finally {
      setSavingComment(false);
    }
  }

  const alert = detail?.alert;
  const linkedRows = useMemo(() => buildLinkedRows(alert), [alert]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-6 py-10 text-sm text-muted-app">
        Loading alert details...
      </div>
    );
  }

  if (error && !alert) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <button
          type="button"
          onClick={() => router.push("/dwms/alerts")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Alerts
        </button>
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  if (!alert) return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/dwms/alerts")}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Alerts
        </button>
        <div className="flex flex-wrap gap-2">
          <Badge className={severityTone[String(alert.severity)]}>{label(String(alert.severity))}</Badge>
          <Badge className={statusTone[String(alert.status)]}>{label(String(alert.status))}</Badge>
          {alert.isAbnormality && <Badge className="border-rose-200 bg-rose-50 text-rose-700">Abnormality</Badge>}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alert #{alert.id.slice(0, 8)}</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">{alert.title}</h1>
            <p className="mt-3 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{alert.description}</p>
          </div>
          <div className="min-w-52 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <CalendarClock className="h-4 w-4" />
              Created
            </div>
            <p className="mt-1">{formatDateTime(alert.createdAt, organizationTimeZone)}</p>
            {alert.resolvedAt && <p className="mt-2">Closed: {formatDateTime(alert.resolvedAt, organizationTimeZone)}</p>}
          </div>
        </div>
      </section>

      <Panel title="Alert Information" icon={<AlertTriangle className="h-4 w-4 text-blue-600" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoItem label="Type" value={label(alert.type)} />
          <InfoItem label="Status" value={label(alert.status)} />
          <InfoItem label="Severity" value={label(String(alert.severity))} />
          <InfoItem label="Raised by" value={alert.raisedBy?.name ?? "System"} />
          {linkedRows.map((row) => (
            <InfoItem key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </Panel>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <History className="h-4 w-4 text-slate-700" />
            <h2>History</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {detail.comments.length}
          </span>
        </div>

        <div className="space-y-4">
          {detail.comments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              No history events have been recorded yet.
            </p>
          ) : (
            detail.comments.map((item) => <CommentItem key={item.id} comment={item} timeZone={organizationTimeZone} />)
          )}
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          {!isCommentOpen ? (
            <button
              type="button"
              onClick={() => setIsCommentOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              <Send className="h-3.5 w-3.5" />
              Add Comment
            </button>
          ) : (
            <form onSubmit={handleCommentSubmit} className="space-y-3">
              <textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add a comment..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCommentOpen(false);
                    setComment("");
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingComment || !comment.trim()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {savingComment ? "Adding..." : "Add Comment"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {alert.correctiveAction && (
        <Panel title="Resolution" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}>
          <NoteBlock title="Corrective Action" body={alert.correctiveAction} />
        </Panel>
      )}

      {(detail.sourceAlert || (detail.abnormalities?.length ?? 0) > 0) && (
        <Panel title="Abnormality Context" icon={<Clock3 className="h-4 w-4 text-rose-600" />}>
          {detail.sourceAlert && <RelatedAlert title="Source Alert" alert={detail.sourceAlert} timeZone={organizationTimeZone} />}
          {(detail.abnormalities ?? []).filter(Boolean).map((item) => (
            <RelatedAlert key={item?.id} title="Created Abnormality" alert={item} timeZone={organizationTimeZone} />
          ))}
        </Panel>
      )}    </div>
  );
}

function buildLinkedRows(alert?: DwmsAlertItem | null) {
  if (!alert) return [];
  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  if (alert.againstUser?.name) {
    rows.push({ label: "Against", value: alert.againstUser.name });
  }
  if (alert.department?.name) {
    rows.push({ label: "Department", value: alert.department.name });
  }
  if (alert.taskInstance?.task?.title) {
    rows.push({
      label: "Linked task",
      value: (
        <Link className="font-semibold text-blue-700 hover:underline" href={`/dwms/tasks/${alert.taskInstance.id}`}>
          {alert.taskInstance.task.title}
        </Link>
      ),
    });
  }
  return rows;
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${className ?? ""}`}>{children}</span>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function NoteBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-700">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function RelatedAlert({ title, alert, timeZone }: { title: string; alert?: Partial<DwmsAlertItem> | null; timeZone?: string | null }) {
  if (!alert?.id) return null;
  return (
    <Link href={`/dwms/alerts/${alert.id}`} className="block rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{alert.title}</p>
      <p className="mt-1 text-xs text-slate-500">{label(String(alert.status))} - {formatDateTime(alert.createdAt, timeZone)}</p>
    </Link>
  );
}

function CommentItem({ comment, timeZone }: { comment: DwmsAlertComment; timeZone?: string | null }) {
  const [title, ...rest] = comment.comment.split(": ");
  const body = rest.join(": ");

  return (
    <div className="relative border-l border-slate-200 pl-4">
      <span className="absolute -left-[7px] top-1 inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500" />
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {body ? title : "Comment added"}
          </h3>
          <span className="text-xs text-slate-500">
            {formatDateTime(comment.createdAt, timeZone)}
          </span>
        </div>
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs text-slate-500">
          <UserRound className="h-3 w-3" />
          {comment.author?.name ?? "Unknown"}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {body || comment.comment}
        </p>
      </div>
    </div>
  );
}











