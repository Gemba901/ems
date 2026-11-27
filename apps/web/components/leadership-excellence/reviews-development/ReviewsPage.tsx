"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, History, Link2, Lock, Plus, RefreshCw, Undo2, X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  acknowledgeReview,
  approveReview,
  createReview,
  getDevelopmentContext,
  getImprovementActions,
  getReview,
  getReviews,
  linkReviewAction,
  refreshReview,
  returnReview,
  reviseReview,
  saveDiscussion,
  saveReflection,
  unlinkReviewAction,
} from "@/services/leadership-excellence/reviews-development.service";
import {
  Empty,
  ErrorBox,
  HowTo,
  Loading,
  NoteDialog,
  PageHeader,
  Pill,
  fmt,
  periodLabel,
  pretty,
  targetLabel,
  useDirectory,
  when,
} from "../monitoring-control/shared";
import type { Discussion, Reflection, ReviewDetail, ReviewStatus, ReviewSummary } from "./types";

const STATUS: Record<ReviewStatus, [string, "gray" | "amber" | "green"]> = {
  DRAFT: ["Draft", "gray"],
  SUBMITTED: ["Reflection submitted", "amber"],
  APPROVED: ["Approved", "green"],
};
const RECORD: Record<string, [string, "gray" | "green" | "red"]> = {
  NOT_SCHEDULED: ["Not scheduled", "gray"],
  NOT_YET_DUE: ["Not yet due", "gray"],
  MISSING: ["Not verified", "red"],
  VERIFIED: ["Verified", "green"],
};

const field = "w-full rounded-md border border-input bg-background p-2 text-sm disabled:opacity-70";
const KEY = "lex06-reviews";

/** 06.01 · Performance reviews: one review per approved plan and period, built on verified facts. */
export function ReviewsPage() {
  const { accessToken, user } = useAuthStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const reviews = useQuery({
    queryKey: [KEY, user?.organizationId],
    queryFn: ({ signal }) => getReviews(accessToken!, signal),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader code="06.01 · Performance reviews" title="Review performance on verified facts."
        lead="A structured conversation between an employee or department and their reviewer, using only results verified in Key Functional Area 5." />
      <HowTo>
        <p><strong className="text-foreground">Who takes part?</strong> A personal review is between the employee and their reporting manager. A department review is held by the plan owner. Nobody can review themselves.</p>
        <p><strong className="text-foreground">How it works:</strong> start a review for a closed period, the employee adds a reflection and submits it, the reviewer records the discussion and decisions, then approves. Approved reviews are locked; changes need a revision with a reason.</p>
        <p><strong className="text-foreground">Facts:</strong> results and actions are copied when the review is started. If they change, refresh the facts before approving. No score is calculated.</p>
        <p><strong className="text-foreground">Privacy:</strong> personal reviews are visible only to the two participants.</p>
      </HowTo>
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus /> Start a review</Button>
      </div>
      {reviews.isPending ? <Loading label="Loading reviews…" />
        : reviews.error ? <ErrorBox error={reviews.error} />
        : !reviews.data.length ? <Empty>No reviews yet. Start one for an approved plan where you are the employee or the reviewer.</Empty>
        : <ReviewTable rows={reviews.data} selected={selected} onSelect={setSelected} />}
      {selected && <ReviewPanel id={selected} onClose={() => setSelected(null)} />}
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setSelected(id); }} />}
    </div>
  );
}

function ReviewTable({ rows, selected, onSelect }: { rows: ReviewSummary[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr><th className="p-2">Review</th><th className="p-2">Period</th><th className="p-2">Participant</th><th className="p-2">Reviewer</th><th className="p-2">Status</th></tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const [label, tone] = STATUS[r.status];
            return (
              <tr key={r.id} className={`cursor-pointer border-t border-border hover:bg-muted/30 ${selected === r.id ? "bg-muted/40" : ""}`} onClick={() => onSelect(r.id)}>
                <td className="p-2"><span className="font-medium">{r.code}</span> · {r.type === "PERSONAL" ? "Personal" : "Department"}<span className="block text-xs text-muted-foreground">{r.planTitle}</span></td>
                <td className="p-2">{periodLabel(r.periodStart, r.periodEnd)}</td>
                <td className="p-2">{r.subjectName || "—"}</td>
                <td className="p-2">{r.reviewerName || "—"}</td>
                <td className="p-2"><div className="flex flex-wrap gap-1"><Pill tone={tone}>{label}</Pill>{r.version > 1 && <Pill tone="navy">v{r.version}</Pill>}
                  {r.acknowledgement?.concern && <Pill tone="red">Concern raised</Pill>}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-[min(36rem,100%)] overflow-y-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { accessToken, user } = useAuthStore();
  const { person } = useDirectory();
  const client = useQueryClient();
  const ctx = useQuery({
    queryKey: ["lex06-context", user?.organizationId],
    queryFn: ({ signal }) => getDevelopmentContext(accessToken!, signal),
    enabled: !!accessToken,
  });
  const [planId, setPlanId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [meeting, setMeeting] = useState("");
  const plan = ctx.data?.plans.find(p => p.documentId === planId);
  const mutation = useMutation({
    mutationFn: () => createReview(accessToken!, { planDocumentId: planId, periodStart: start, periodEnd: end, meetingDate: meeting }),
    onSuccess: r => { void client.invalidateQueries({ queryKey: [KEY] }); onCreated(r.id); },
  });
  const ready = planId && start && end && meeting && start <= end;

  return (
    <Modal title="Start a performance review" onClose={onClose}>
      {ctx.isPending ? <Loading label="Loading plans…" />
        : ctx.error ? <ErrorBox error={ctx.error} />
        : !ctx.data.plans.length ? <Empty>No approved plan where you are the employee or the reviewer. Plans are approved in Key Functional Area 3, and reviewers come from the EMS reporting line.</Empty>
        : <form className="space-y-3 text-sm" onSubmit={e => { e.preventDefault(); if (ready) mutation.mutate(); }}>
          <label className="block space-y-1">
            <span className="font-medium">Approved plan</span>
            <select className={field} value={planId} onChange={e => { setPlanId(e.target.value); setStart(""); setEnd(""); }}>
              <option value="">Choose a plan…</option>
              {ctx.data.plans.map(p => <option key={p.documentId} value={p.documentId}>{p.title} · {p.type === "PERSONAL" ? "Personal" : "Department"} · v{p.version}</option>)}
            </select>
          </label>
          {plan && <p className="text-muted-foreground">Participant: <span className="text-foreground">{person(plan.subjectId)}</span> · Reviewer: <span className="text-foreground">{person(plan.reviewerId)}</span></p>}
          {plan && plan.periods.length > 0 && (
            <label className="block space-y-1">
              <span className="font-medium">Suggested period</span>
              <select className={field} value={start && end ? `${start}|${end}` : ""} onChange={e => { const [s, t] = e.target.value.split("|"); setStart(s ?? ""); setEnd(t ?? ""); }}>
                <option value="">Choose a period or enter dates below…</option>
                {plan.periods.map(p => <option key={p.start} value={`${p.start}|${p.end}`}>{periodLabel(p.start, p.end)}{p.closed ? "" : " (still open)"}</option>)}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1"><span className="font-medium">From</span><input type="date" className={field} value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="space-y-1"><span className="font-medium">To</span><input type="date" className={field} value={end} onChange={e => setEnd(e.target.value)} /></label>
            <label className="space-y-1"><span className="font-medium">Discussion date</span><input type="date" className={field} value={meeting} onChange={e => setMeeting(e.target.value)} /></label>
          </div>
          {mutation.error && <ErrorBox error={mutation.error} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!ready || mutation.isPending}>{mutation.isPending ? "Starting…" : "Start review"}</Button>
          </div>
        </form>}
    </Modal>
  );
}

type Dialog = "return" | "revise" | "acknowledge" | "concern" | null;

function ReviewPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { accessToken, user } = useAuthStore();
  const { person } = useDirectory();
  const client = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showHistory, setShowHistory] = useState(false);
  const review = useQuery({
    queryKey: [KEY, user?.organizationId, id],
    queryFn: ({ signal }) => getReview(accessToken!, id, signal),
    enabled: !!accessToken,
  });
  const put = (r: ReviewDetail) => {
    client.setQueryData([KEY, user?.organizationId, id], r);
    void client.invalidateQueries({ queryKey: [KEY, user?.organizationId], exact: true });
  };
  const act = useMutation({
    mutationFn: (fn: () => Promise<ReviewDetail>) => fn(),
    onSuccess: r => { put(r); setDialog(null); },
  });

  if (review.isPending) return <Card><CardContent className="p-6"><Loading label="Loading review…" /></CardContent></Card>;
  if (review.error) return <ErrorBox error={review.error} />;
  const r = review.data;
  const [label, tone] = STATUS[r.status];
  const token = accessToken!;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap gap-2"><Pill tone={tone}>{label}</Pill><Pill tone="navy">Version {r.version}</Pill>
              {r.status === "APPROVED" && <Pill tone="gray"><Lock className="mr-1 size-3" /> Locked</Pill>}</div>
            <CardTitle>{r.code} · {r.planTitle}</CardTitle>
            <CardDescription>{r.type === "PERSONAL" ? "Personal" : "Department"} review · {periodLabel(r.periodStart, r.periodEnd)} · {person(r.subjectId)} with {person(r.reviewerId)} · discussion {pretty(r.meetingDate)}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close review" onClick={onClose}><X /></Button>
        </div>
        {r.returnReason && <Notice tone="amber">Returned for clarification: {r.returnReason}</Notice>}
        {r.reason && r.status !== "APPROVED" && <Notice tone="navy">Revision reason: {r.reason}</Notice>}
        {r.factsChanged && <Notice tone="amber">Verified results or actions changed since these facts were read. {r.can.review ? "Refresh the facts before approving." : "The reviewer must refresh them before approving."}</Notice>}
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <Facts review={r} canRefresh={r.can.review} busy={act.isPending} onRefresh={() => act.mutate(() => refreshReview(token, r.id))} />
        <ReflectionForm key={`ref-${r.updatedAt}`} review={r} busy={act.isPending}
          onSave={(body, submit) => act.mutate(() => saveReflection(token, r.id, body, submit))} />
        <DiscussionForm key={`dis-${r.updatedAt}`} review={r} busy={act.isPending}
          onSave={body => act.mutate(() => saveDiscussion(token, r.id, body))} />
        <LinkedActions ids={r.linkedActionIds} canLink={r.can.link} busy={act.isPending}
          onLink={actionId => act.mutate(() => linkReviewAction(token, r.id, actionId))}
          onUnlink={actionId => act.mutate(() => unlinkReviewAction(token, r.id, actionId))} />
        {r.acknowledgement && (
          <Notice tone={r.acknowledgement.concern ? "red" : "green"}>
            {person(r.acknowledgement.employeeId)} acknowledged version {r.acknowledgement.version} on {pretty(r.acknowledgement.acknowledgedAt)}{r.acknowledgement.concern ? " and raised a concern" : ""}.
            {r.acknowledgement.comment && <span className="mt-1 block italic">“{r.acknowledgement.comment}”</span>}
          </Notice>
        )}
        {act.error && <ErrorBox error={act.error} />}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {r.can.approve && <Button disabled={act.isPending} onClick={() => act.mutate(() => approveReview(token, r.id))}><CheckCircle2 /> Approve and lock</Button>}
          {r.can.returnForClarification && <Button variant="outline" onClick={() => setDialog("return")}><Undo2 /> Return for clarification</Button>}
          {r.can.revise && <Button variant="outline" onClick={() => setDialog("revise")}>Open a revision</Button>}
          {r.can.acknowledge && <>
            <Button onClick={() => setDialog("acknowledge")}>Acknowledge receipt</Button>
            <Button variant="outline" onClick={() => setDialog("concern")}>Acknowledge with a concern</Button>
          </>}
          <Button variant="ghost" aria-expanded={showHistory} onClick={() => setShowHistory(v => !v)}><History /> History ({r.history.length})</Button>
        </div>
        {showHistory && (
          <ol className="space-y-1 border-l border-border pl-4 text-xs text-muted-foreground">
            {r.history.map((h, i) => (
              <li key={i}><span className="font-medium text-foreground">{h.action}</span> · {when(h.at)} · {h.actorId ? person(h.actorId) : "System"}
                {h.note && <span className="block italic">“{h.note}”</span>}</li>
            ))}
            {r.versions.map(v => <li key={`v${v.version}`}>Version {v.version} approved {when(v.approvedAt)} by {person(v.approvedById)}</li>)}
          </ol>
        )}
      </CardContent>
      {dialog === "return" && <NoteDialog title="Return for clarification" label="What needs clarifying" required confirm="Return"
        description="The reflection goes back to the participant as a draft." busy={act.isPending}
        onConfirm={note => act.mutate(() => returnReview(token, r.id, note))} onClose={() => setDialog(null)} />}
      {dialog === "revise" && <NoteDialog title="Open a revision" label="Why a revision is needed" required confirm="Open revision"
        description={`Version ${r.version} stays on record. A new draft (version ${r.version + 1}) is opened for changes.`} busy={act.isPending}
        onConfirm={note => act.mutate(() => reviseReview(token, r.id, note))} onClose={() => setDialog(null)} />}
      {(dialog === "acknowledge" || dialog === "concern") && <NoteDialog
        title={dialog === "concern" ? "Acknowledge with a concern" : "Acknowledge receipt"}
        label={dialog === "concern" ? "Your concern" : "Comment"} required={dialog === "concern"} confirm="Acknowledge"
        description="Acknowledging confirms you received the approved review. It does not mean you agree with it." busy={act.isPending}
        onConfirm={note => act.mutate(() => acknowledgeReview(token, r.id, note, dialog === "concern"))} onClose={() => setDialog(null)} />}
    </Card>
  );
}

function Notice({ tone, children }: { tone: "amber" | "navy" | "green" | "red"; children: ReactNode }) {
  const cls = {
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    navy: "border-gemba-navy/30 bg-gemba-navy/5 text-foreground",
    green: "border-gemba-lime/40 bg-gemba-lime/10 text-foreground",
    red: "border-gemba-red/40 bg-gemba-red/10 text-foreground",
  }[tone];
  return <div className={`rounded-md border p-3 text-sm ${cls}`}>{children}</div>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div><h3 className="font-semibold">{title}</h3>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      {children}
    </section>
  );
}

function Facts({ review: r, canRefresh, busy, onRefresh }: { review: ReviewDetail; canRefresh: boolean; busy: boolean; onRefresh: () => void }) {
  const { person } = useDirectory();
  const s = r.snapshot;
  return (
    <Section title="Verified facts" hint={`Read ${when(s.at)} from plan version ${s.planVersion}. Only verified results count.`}>
      {!s.complete && <Notice tone="amber">Some scheduled results are not verified, or a KPI period crosses the review period. Record the limitation before approving.</Notice>}
      {!s.measures.length ? <Empty>This plan has no KPIs.</Empty> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left text-muted-foreground"><tr><th className="p-2">KPI</th><th className="p-2">Period</th><th className="p-2">Target</th><th className="p-2">Verified actual</th><th className="p-2">Status</th></tr></thead>
            <tbody>
              {s.measures.flatMap(m => (m.records.length ? m.records : [null]).map((rec, i) => (
                <tr key={`${m.id}-${rec?.periodId ?? i}`} className="border-t border-border">
                  {i === 0 && <td className="p-2 align-top" rowSpan={Math.max(m.records.length, 1)}><span className="font-medium">{m.code ? `${m.code} · ` : ""}{m.name}</span>
                    <span className="block text-muted-foreground">{person(m.ownerId)} · {m.verified}/{m.scheduled} verified{m.crossing ? " · period crosses review" : ""}</span></td>}
                  {rec ? <>
                    <td className="p-2">{periodLabel(rec.start, rec.end)}</td>
                    <td className="p-2">{targetLabel(rec.target, rec.upper)} {m.unit}</td>
                    <td className="p-2">{rec.status === "VERIFIED" ? `${fmt(rec.actual)} ${m.unit}` : "—"}</td>
                    <td className="p-2"><Pill tone={RECORD[rec.status][1]}>{RECORD[rec.status][0]}</Pill></td>
                  </> : <td className="p-2 text-muted-foreground" colSpan={4}>No periods in this review.</td>}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
      {s.actions.length > 0 && (
        <ul className="space-y-1 text-xs">
          {s.actions.map(a => <li key={a.id}>· {a.title} — {person(a.ownerId)}, due {pretty(a.dueAt)} <Pill tone={a.status === "VERIFIED" ? "green" : "gray"}>{a.status.replace("_", " ").toLowerCase()}</Pill></li>)}
        </ul>
      )}
      {canRefresh && <Button size="sm" variant="outline" disabled={busy} onClick={onRefresh}><RefreshCw /> Refresh facts</Button>}
    </Section>
  );
}

function Text({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="font-medium">{label}</span>
      <textarea className={field} rows={3} maxLength={2500} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function ReflectionForm({ review: r, busy, onSave }: { review: ReviewDetail; busy: boolean; onSave: (body: Reflection, submit: boolean) => void }) {
  const [v, setV] = useState<Reflection>(r.reflection);
  const edit = r.can.reflect;
  const set = (k: keyof Reflection) => (x: string) => setV(p => ({ ...p, [k]: x }));
  const empty = !Object.values(r.reflection).some(x => typeof x === "string" && x.trim());
  if (!edit && empty) return (
    <Section title="Participant reflection"><p className="text-muted-foreground">{r.status === "DRAFT" ? `Waiting for ${r.subjectName || "the participant"}.` : "No reflection was recorded."}</p></Section>
  );
  return (
    <Section title="Participant reflection" hint={r.reflection.submittedAt ? `Submitted ${when(r.reflection.submittedAt)}` : edit ? "Only you can write this part. Submit it when ready for the discussion." : undefined}>
      <div className="grid gap-3 md:grid-cols-2">
        <Text label="Achievements" value={v.achievements} onChange={set("achievements")} disabled={!edit} />
        <Text label="Challenges" value={v.challenges} onChange={set("challenges")} disabled={!edit} />
        <Text label="What I learned" value={v.learning} onChange={set("learning")} disabled={!edit} />
        <Text label="Support I need" value={v.supportNeeded} onChange={set("supportNeeded")} disabled={!edit} />
      </div>
      {edit && <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave(v, false)}>Save draft</Button>
        <Button size="sm" disabled={busy} onClick={() => onSave(v, true)}>Submit reflection</Button>
      </div>}
    </Section>
  );
}

function DiscussionForm({ review: r, busy, onSave }: { review: ReviewDetail; busy: boolean; onSave: (body: Discussion & { meetingDate: string }) => void }) {
  const [v, setV] = useState({ ...r.discussion, nextReviewDate: r.discussion.nextReviewDate ?? "", meetingDate: r.meetingDate });
  const edit = r.can.review;
  const set = (k: keyof typeof v) => (x: string) => setV(p => ({ ...p, [k]: x }));
  const empty = !r.discussion.findings && !r.discussion.decisions && !r.discussion.recognition;
  if (!edit && empty) return <Section title="Reviewer discussion"><p className="text-muted-foreground">Not recorded yet.</p></Section>;
  return (
    <Section title="Reviewer discussion" hint={edit ? "Only the reviewer writes this part. Findings and decisions are needed before approval." : undefined}>
      <div className="grid gap-3 md:grid-cols-2">
        <Text label="Recognition" value={v.recognition} onChange={set("recognition")} disabled={!edit} />
        <Text label="Findings" value={v.findings} onChange={set("findings")} disabled={!edit} />
        <Text label="Decisions and agreed support" value={v.decisions} onChange={set("decisions")} disabled={!edit} />
        {r.type === "PERSONAL" && <Text label="Why the reflection is unavailable (if it is)" value={v.noInputReason} onChange={set("noInputReason")} disabled={!edit} />}
        <Text label="Data limitations (if facts are incomplete)" value={v.dataLimitReason} onChange={set("dataLimitReason")} disabled={!edit} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1"><span className="font-medium">Discussion date</span><input type="date" className={field} value={v.meetingDate} disabled={!edit} onChange={e => set("meetingDate")(e.target.value)} /></label>
        <label className="space-y-1"><span className="font-medium">Next review (optional)</span><input type="date" className={field} value={v.nextReviewDate ?? ""} disabled={!edit} onChange={e => set("nextReviewDate")(e.target.value)} /></label>
      </div>
      {edit && <Button size="sm" variant="outline" disabled={busy || !v.meetingDate} onClick={() => onSave({ ...v, nextReviewDate: v.nextReviewDate || null })}>Save discussion</Button>}
    </Section>
  );
}

/** Existing Area 04 actions linked to a review or coaching record. Shared with 06.02. */
export function LinkedActions({ ids, canLink, busy, onLink, onUnlink }: { ids: string[]; canLink: boolean; busy: boolean; onLink: (id: string) => void; onUnlink: (id: string) => void }) {
  const { accessToken, user } = useAuthStore();
  const { person } = useDirectory();
  const [choice, setChoice] = useState("");
  const actions = useQuery({
    queryKey: ["lex06-actions", user?.organizationId],
    queryFn: ({ signal }) => getImprovementActions(accessToken!, signal),
    enabled: !!accessToken,
  });
  const byId = new Map((actions.data ?? []).map(a => [a.id, a]));
  const options = (actions.data ?? []).filter(a => a.status !== "CANCELLED" && !ids.includes(a.id));
  return (
    <Section title="Linked actions" hint="Link existing Key Functional Area 4 actions. New actions are added to the plan there.">
      {!ids.length ? <p className="text-muted-foreground">No actions linked.</p> : (
        <ul className="space-y-1">
          {ids.map(id => {
            const a = byId.get(id);
            return (
              <li key={id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1">
                <span>{a ? `${a.title} · ${person(a.ownerId)} · due ${pretty(a.dueAt)}` : "Action outside your view"}</span>
                {canLink && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUnlink(id)}>Unlink</Button>}
              </li>
            );
          })}
        </ul>
      )}
      {canLink && options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select className="h-9 min-w-64 rounded-md border border-input bg-background px-2 text-sm" value={choice} onChange={e => setChoice(e.target.value)}>
            <option value="">Choose an action…</option>
            {options.map(a => <option key={a.id} value={a.id}>{a.title} · {person(a.ownerId)}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={!choice || busy} onClick={() => { onLink(choice); setChoice(""); }}><Link2 /> Link</Button>
        </div>
      )}
    </Section>
  );
}
