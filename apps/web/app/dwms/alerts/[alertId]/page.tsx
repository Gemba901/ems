"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/PageHeader";
import { SectionCard } from "@/components/patterns/SectionCard";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [notes, setNotes] = useState<Record<string, string>>({});
  const submitting = useRef(false);
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
    const note = notes[occurrenceId] ?? "";
    if (!note.trim() || submitting.current) return;
    submitting.current = true;
    setError(null);
    setSavingId(occurrenceId);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.acknowledgeAlertOccurrence(token, alertId, occurrenceId, note);
      setNotes((current) => ({ ...current, [occurrenceId]: "" }));
      await load();
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to acknowledge alert."));
    } finally {
      submitting.current = false;
      setSavingId(null);
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!comment.trim() || submitting.current) return;
    submitting.current = true;
    setError(null);
    setSavingId("comment");
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.addAlertComment(token, alertId, comment);
      setComment("");
      await load();
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, "Failed to add comment."));
    } finally {
      submitting.current = false;
      setSavingId(null);
    }
  }

  async function raiseImprovement(kind: "kaizen" | "sga") {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setSavingId(kind);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.raiseImprovementFromAlert(token, alertId, kind);
      setRaising(null);
      await load();
    } catch (cause) {
      setError(getDwmsErrorMessage(cause, `Failed to raise the ${kind === "kaizen" ? "Kaizen" : "SGA"}.`));
    } finally {
      submitting.current = false;
      setSavingId(null);
    }
  }

  const alert = detail?.alert;
  const isResponsible = Boolean(alert?.responsibleEmployee?.id && alert.responsibleEmployee.id === detail?.employeeId);
  return <div className="mx-auto w-full max-w-4xl min-w-0 space-y-5 px-4 py-6 sm:space-y-6 sm:px-6 sm:py-8">
    <Button variant="ghost" type="button" onClick={() => router.back()} className="min-h-11 w-fit rounded-lg px-1 text-sm font-semibold text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info">← Back</Button>
    {error && <ErrorState description={error} onRetry={!alert ? () => void load() : undefined} />}
    {!alert ? loading && <LoadingState label="Loading alert…" /> : <>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Badge variant={alert.severity === "CRITICAL" ? "danger" : alert.severity === "HIGH" ? "warning" : "info"}>{alert.severity}</Badge>
          {alert.isAbnormality && <span className="rounded-full bg-danger-subtle px-3 py-1 text-danger">Abnormality</span>}
          <span className="rounded-full bg-muted px-3 py-1 text-foreground">Raised {alert.raiseCount} times</span>
        </div>
        <PageHeader title={alert.title} />
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{alert.description}</p>
        <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Responsible person</dt><dd className="font-medium">{alert.responsibleEmployee?.name ?? "None"}</dd></div>
          <div><dt className="text-muted-foreground">Initially raised by</dt><dd className="font-medium">{alert.raisedBy?.name ?? "System"}</dd></div>
          {alert.taskInstance && <div><dt className="text-muted-foreground">Task</dt><dd className="font-medium">{alert.taskInstance.task.title}</dd></div>}
          {alert.department && <div><dt className="text-muted-foreground">Department</dt><dd className="font-medium">{alert.department.name}</dd></div>}
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
      <SectionCard title="Alert history">
        <ol className="mt-4 space-y-4">
          {alert.occurrences.map((item, index) => <li key={item.id} className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold text-foreground">Raise #{index + 1} · {item.raisedBy?.name ?? "System"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.raisedAt)}</p>
            {item.acknowledgedAt ? <div className="mt-3 rounded-lg bg-success-subtle p-3">
              <p className="text-xs font-semibold text-success">Acknowledged by {item.acknowledgedBy?.name ?? "Responsible person"} · {formatDate(item.acknowledgedAt)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-success">{item.acknowledgmentNote}</p>
            </div> : alert.responsibleEmployee ? <div className="mt-3">
              <p className="text-xs font-semibold text-warning">Not Acknowledged</p>
              {isResponsible && <div className="mt-2 space-y-2">
                <Textarea aria-label={`Acknowledgment note for raise ${index + 1}`} value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} disabled={Boolean(savingId)} rows={3} placeholder="Write your acknowledgment note..." className="w-full rounded-lg border border-border p-3 text-sm" />
                <Button variant="ghost" type="button" disabled={!notes[item.id]?.trim() || Boolean(savingId)} onClick={() => void acknowledge(item.id)} className="min-h-11 w-full rounded-xl bg-info px-4 py-2 text-sm font-semibold text-info-foreground disabled:opacity-50 sm:w-auto">{savingId === item.id ? "Saving..." : "Acknowledge"}</Button>
              </div>}
            </div> : <p className="mt-3 text-xs text-muted-foreground">No acknowledgment required.</p>}
          </li>)}
        </ol>
      </SectionCard>
      <SectionCard title="Comments">
        <div className="mt-4 space-y-3">{detail.comments.map((item) => <article key={item.id} className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">{item.author?.name ?? "Employee"} <span className="font-normal text-muted-foreground">· {formatDate(item.createdAt)}</span></p>
          <p className="mt-1 whitespace-pre-wrap">{item.comment}</p>
        </article>)}</div>
        <form onSubmit={addComment} className="mt-4 space-y-2">
          <Textarea aria-label="Add comment" value={comment} disabled={Boolean(savingId)} onChange={(event) => setComment(event.target.value)} rows={3} className="w-full rounded-lg border border-border p-3 text-sm" />
          <Button type="submit" disabled={!comment.trim() || Boolean(savingId)} className="min-h-11 w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto">Add comment</Button>
        </form>
      </SectionCard>
    </>}
  </div>;
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

  return <SectionCard title="Fix the cause">
    {raised ? <p className="mt-2 text-sm text-foreground">
      {raised.label} raised from this {kind}:{" "}
      <Link href={raised.href} className="font-semibold text-info hover:underline">{raised.title || `Open the ${raised.label}`}</Link>
    </p> : raising ? <div className="mt-3 space-y-3 rounded-xl bg-muted p-4">
      <p className="text-sm text-foreground">
        A draft {raising === "kaizen" ? "Kaizen" : "SGA"} is created for {ownerName}, prefilled from this {kind}. They complete it in the {raising === "kaizen" ? "Kaizen" : "SGA"} module.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="ghost" type="button" disabled={saving} onClick={() => onConfirm(raising)} className="min-h-11 rounded-xl bg-info px-4 py-2 text-sm font-semibold text-info-foreground disabled:opacity-50">{saving ? "Raising..." : `Raise ${raising === "kaizen" ? "Kaizen" : "SGA"}`}</Button>
        <Button variant="ghost" type="button" disabled={saving} onClick={() => onPick(null)} className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground">Cancel</Button>
      </div>
    </div> : <>
      <p className="mt-2 text-sm text-muted-foreground">If this keeps happening, raise an improvement to remove the cause: a Kaizen for a small fix, or an SGA when it needs a team.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {canKaizen && <Button variant="ghost" type="button" onClick={() => onPick("kaizen")} className="min-h-11 rounded-xl border border-success bg-success-subtle px-4 py-2 text-sm font-semibold text-success hover:bg-success-subtle">Raise Kaizen</Button>}
        {canSga && <Button variant="ghost" type="button" onClick={() => onPick("sga")} className="min-h-11 rounded-xl border border-info bg-info-subtle px-4 py-2 text-sm font-semibold text-info hover:bg-info-subtle">Raise SGA</Button>}
      </div>
    </>}
  </SectionCard>;
}
