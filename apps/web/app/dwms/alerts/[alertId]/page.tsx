"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService, getDwmsErrorMessage, type DwmsAlertDetailResponse,
} from "@/services/dwms.service";

export default function AlertDetailRoute() {
  return <ProtectedRoute><AlertDetailPage /></ProtectedRoute>;
}

function AlertDetailPage() {
  const router = useRouter();
  const params = useParams<{ alertId: string }>();
  const alertId = params.alertId;
  const timeZone = useAuthStore((state) => state.user?.organizationTimeZone) || "UTC";
  const [detail, setDetail] = useState<DwmsAlertDetailResponse | null>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!alertId) return;
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      setDetail(await DwmsService.getAlertDetail(token, alertId));
      setError(null);
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to load alert."));
    }
  }, [alertId]);

  useEffect(() => { void load(); }, [load]);

  const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", {
    timeZone, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));

  async function acknowledge(occurrenceId: string) {
    if (!note.trim()) return;
    setSavingId(occurrenceId);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.acknowledgeAlertOccurrence(token, alertId, occurrenceId, note);
      setNote("");
      await load();
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to acknowledge alert."));
    } finally {
      setSavingId(null);
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    setSavingId("comment");
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.addAlertComment(token, alertId, comment);
      setComment("");
      await load();
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to add comment."));
    } finally {
      setSavingId(null);
    }
  }

  const alert = detail?.alert;
  const isResponsible = Boolean(alert?.responsibleEmployee?.id && alert.responsibleEmployee.id === detail?.employeeId);
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <button type="button" onClick={() => router.push(alert?.isAbnormality ? "/dwms/abnormalities" : "/dwms/alerts")} className="text-sm font-semibold text-blue-700">← {alert?.isAbnormality ? "Abnormalities" : "Alerts"}</button>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {!alert ? <p className="text-sm text-slate-500">Loading alert...</p> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{alert.severity}</span>
          {alert.isAbnormality && <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Abnormality</span>}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Raised {alert.raiseCount} times</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{alert.title}</h1>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{alert.description}</p>
        <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Responsible person</dt><dd className="font-medium">{alert.responsibleEmployee?.name ?? "None"}</dd></div>
          <div><dt className="text-slate-500">Initially raised by</dt><dd className="font-medium">{alert.raisedBy?.name ?? "System"}</dd></div>
          {alert.taskInstance && <div><dt className="text-slate-500">Task</dt><dd className="font-medium">{alert.taskInstance.task.title}</dd></div>}
          {alert.department && <div><dt className="text-slate-500">Department</dt><dd className="font-medium">{alert.department.name}</dd></div>}
        </dl>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Alert history</h2>
        <ol className="mt-4 space-y-4">
          {alert.occurrences.map((item, index) => <li key={item.id} className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Raise #{index + 1} · {item.raisedBy?.name ?? "System"}</p>
            <p className="mt-1 text-xs text-slate-500">{formatDate(item.raisedAt)}</p>
            {item.acknowledgedAt ? <div className="mt-3 rounded-lg bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-800">Acknowledged by {item.acknowledgedBy?.name ?? "Responsible person"} · {formatDate(item.acknowledgedAt)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-950">{item.acknowledgmentNote}</p>
            </div> : alert.responsibleEmployee ? <div className="mt-3">
              <p className="text-xs font-semibold text-amber-800">Not Acknowledged</p>
              {isResponsible && <div className="mt-2 space-y-2">
                <textarea aria-label={`Acknowledgment note for raise ${index + 1}`} value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Write your acknowledgment note..." className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
                <button type="button" disabled={!note.trim() || Boolean(savingId)} onClick={() => void acknowledge(item.id)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingId === item.id ? "Saving..." : "Acknowledge"}</button>
              </div>}
            </div> : <p className="mt-3 text-xs text-slate-500">No acknowledgment required.</p>}
          </li>)}
        </ol>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Comments</h2>
        <div className="mt-4 space-y-3">{detail.comments.map((item) => <article key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-semibold">{item.author?.name ?? "Employee"} <span className="font-normal text-slate-500">· {formatDate(item.createdAt)}</span></p>
          <p className="mt-1 whitespace-pre-wrap">{item.comment}</p>
        </article>)}</div>
        <form onSubmit={addComment} className="mt-4 space-y-2">
          <textarea aria-label="Add comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
          <button type="submit" disabled={!comment.trim() || Boolean(savingId)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add comment</button>
        </form>
      </section>
    </>}
  </main>;
}
