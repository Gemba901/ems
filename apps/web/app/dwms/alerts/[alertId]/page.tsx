"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { useOrgModules } from "@/hooks/useOrgModules";
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
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState<"kaizen" | "sga" | null>(null);
  const { hasModule } = useOrgModules();

  const load = useCallback(async () => {
    if (!alertId) return;
    setLoading(true);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      setDetail(await DwmsService.getAlertDetail(token, alertId));
      setError(null);
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to load alert."));
    } finally {
      setLoading(false);
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

  async function raiseImprovement(kind: "kaizen" | "sga") {
    setSavingId(kind);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.raiseImprovementFromAlert(token, alertId, kind);
      setRaising(null);
      await load();
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, `Failed to raise the ${kind === "kaizen" ? "Kaizen" : "SGA"}.`));
    } finally {
      setSavingId(null);
    }
  }

  const alert = detail?.alert;
  const isResponsible = Boolean(alert?.responsibleEmployee?.id && alert.responsibleEmployee.id === detail?.employeeId);
  return <main className="mx-auto w-full max-w-4xl min-w-0 space-y-5 px-4 py-6 sm:space-y-6 sm:px-6 sm:py-8">
    <button type="button" onClick={() => router.back()} className="min-h-11 w-fit rounded-lg px-1 text-sm font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">← Back</button>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {!alert ? loading && <p role="status" className="text-sm text-slate-500">Loading alert...</p> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{alert.severity}</span>
          {alert.isAbnormality && <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Abnormality</span>}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Raised {alert.raiseCount} times</span>
        </div>
        <h1 className="mt-4 break-words text-xl font-bold text-slate-900 sm:text-2xl">{alert.title}</h1>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{alert.description}</p>
        <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Responsible person</dt><dd className="font-medium">{alert.responsibleEmployee?.name ?? "None"}</dd></div>
          <div><dt className="text-slate-500">Initially raised by</dt><dd className="font-medium">{alert.raisedBy?.name ?? "System"}</dd></div>
          {alert.taskInstance && <div><dt className="text-slate-500">Task</dt><dd className="font-medium">{alert.taskInstance.task.title}</dd></div>}
          {alert.department && <div><dt className="text-slate-500">Department</dt><dd className="font-medium">{alert.department.name}</dd></div>}
        </dl>
      </section>
      <ImprovementSection
        alert={alert}
        ownerName={alert.responsibleEmployee?.name ?? "you"}
        canKaizen={hasModule("KAIZEN")}
        canSga={hasModule("SGA")}
        raising={raising}
        saving={savingId === "kaizen" || savingId === "sga"}
        onPick={setRaising}
        onConfirm={(kind) => void raiseImprovement(kind)}
      />
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
                <button type="button" disabled={!note.trim() || Boolean(savingId)} onClick={() => void acknowledge(item.id)} className="min-h-11 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">{savingId === item.id ? "Saving..." : "Acknowledge"}</button>
              </div>}
            </div> : <p className="mt-3 text-xs text-slate-500">No acknowledgment required.</p>}
          </li>)}
        </ol>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Comments</h2>
        <div className="mt-4 space-y-3">{detail.comments.map((item) => <article key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-semibold">{item.author?.name ?? "Employee"} <span className="font-normal text-slate-500">· {formatDate(item.createdAt)}</span></p>
          <p className="mt-1 whitespace-pre-wrap">{item.comment}</p>
        </article>)}</div>
        <form onSubmit={addComment} className="mt-4 space-y-2">
          <textarea aria-label="Add comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
          <button type="submit" disabled={!comment.trim() || Boolean(savingId)} className="min-h-11 w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">Add comment</button>
        </form>
      </section>
    </>}
  </main>;
}

// Join 10: fix the cause with a Kaizen (one owner) or an SGA (a team project). The draft is
// prefilled from the alert and owned by the responsible person, or by you when there is none.
function ImprovementSection({ alert, ownerName, canKaizen, canSga, raising, saving, onPick, onConfirm }: {
  alert: DwmsAlertDetailResponse["alert"];
  ownerName: string;
  canKaizen: boolean;
  canSga: boolean;
  raising: "kaizen" | "sga" | null;
  saving: boolean;
  onPick: (kind: "kaizen" | "sga" | null) => void;
  onConfirm: (kind: "kaizen" | "sga") => void;
}) {
  const raised = alert.raisedKaizen
    ? { href: `/kaizen/${alert.raisedKaizen.id}`, label: "Kaizen", title: alert.raisedKaizen.title }
    : alert.raisedSga
      ? { href: `/sga/${alert.raisedSga.id}`, label: "SGA", title: alert.raisedSga.title }
      : null;
  if (!raised && !canKaizen && !canSga) return null;
  const kind = alert.isAbnormality ? "abnormality" : "alert";

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <h2 className="text-lg font-semibold text-slate-900">Fix the cause</h2>
    {raised ? <p className="mt-2 text-sm text-slate-700">
      {raised.label} raised from this {kind}:{" "}
      <Link href={raised.href} className="font-semibold text-blue-700 hover:underline">{raised.title || `Open the ${raised.label}`}</Link>
    </p> : raising ? <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-700">
        A draft {raising === "kaizen" ? "Kaizen" : "SGA"} is created for {ownerName}, prefilled from this {kind}. They complete it in the {raising === "kaizen" ? "Kaizen" : "SGA"} module.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={saving} onClick={() => onConfirm(raising)} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Raising..." : `Raise ${raising === "kaizen" ? "Kaizen" : "SGA"}`}</button>
        <button type="button" disabled={saving} onClick={() => onPick(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
      </div>
    </div> : <>
      <p className="mt-2 text-sm text-slate-600">If this keeps happening, raise an improvement to remove the cause: a Kaizen for a small fix, or an SGA when it needs a team.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {canKaizen && <button type="button" onClick={() => onPick("kaizen")} className="min-h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">Raise Kaizen</button>}
        {canSga && <button type="button" onClick={() => onPick("sga")} className="min-h-11 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-800 hover:bg-purple-100">Raise SGA</button>}
      </div>
    </>}
  </section>;
}
