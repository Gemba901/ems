"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createCoaching,
  getCoaching,
  getDevelopmentContext,
  linkCoachingAction,
  unlinkCoachingAction,
  updateCoaching,
} from "@/services/leadership-excellence/reviews-development.service";
import { Empty, ErrorBox, HowTo, Loading, PageHeader, Pill, pretty, useDirectory } from "../monitoring-control/shared";
import { LinkedActions } from "./ReviewsPage";
import type { CoachingKind, CoachingRecord } from "./types";

const KIND: Record<CoachingKind, [string, "green" | "amber" | "navy"]> = {
  RECOGNITION: ["Recognition", "green"],
  FEEDBACK: ["Feedback", "amber"],
  COACHING: ["Coaching", "navy"],
};
const field = "w-full rounded-md border border-input bg-background p-2 text-sm disabled:opacity-70";
const KEY = "lex06-coaching";

/** 06.02 · Feedback & coaching: private conversations between an employee and their manager. */
export function CoachingPage() {
  const { accessToken, user } = useAuthStore();
  const [creating, setCreating] = useState(false);
  const records = useQuery({
    queryKey: [KEY, user?.organizationId],
    queryFn: ({ signal }) => getCoaching(accessToken!, signal),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader code="06.02 · Feedback & coaching" title="Keep development conversations going."
        lead="Record recognition, feedback and coaching between formal reviews, linked to the goals and KPIs in the approved plan." />
      <HowTo>
        <p><strong className="text-foreground">Who can see it?</strong> Only the employee and their manager. Other managers, HR and administrators cannot read these notes.</p>
        <p><strong className="text-foreground">How to use:</strong> either participant records a discussion. The manager writes the notes and agreed support; the employee writes their response. Each person changes only their own part.</p>
        <p><strong className="text-foreground">Follow-up:</strong> link an existing Key Functional Area 4 action when the discussion agrees one. There is no approval step.</p>
      </HowTo>
      <div className="flex justify-end"><Button onClick={() => setCreating(true)}><Plus /> Record a discussion</Button></div>
      {creating && <CreateForm onDone={() => setCreating(false)} />}
      {records.isPending ? <Loading label="Loading discussions…" />
        : records.error ? <ErrorBox error={records.error} />
        : !records.data.length ? <Empty>No discussions recorded. Only discussions you take part in are shown.</Empty>
        : <div className="space-y-3">{records.data.map(r => <CoachingCard key={r.id} record={r} />)}</div>}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { accessToken, user } = useAuthStore();
  const { me, person } = useDirectory();
  const client = useQueryClient();
  const ctx = useQuery({
    queryKey: ["lex06-context", user?.organizationId],
    queryFn: ({ signal }) => getDevelopmentContext(accessToken!, signal),
    enabled: !!accessToken,
  });
  const plans = (ctx.data?.plans ?? []).filter(p => p.kind === "INDIVIDUAL");
  const [v, setV] = useState({ planDocumentId: "", kind: "FEEDBACK" as CoachingKind, date: "", topic: "", relatesTo: "role", notes: "", support: "" });
  const plan = plans.find(p => p.documentId === v.planDocumentId);
  const manager = plan && (ctx.data?.me ?? me) === plan.reviewerId;
  const mutation = useMutation({
    mutationFn: () => createCoaching(accessToken!, { ...v, support: manager ? v.support : undefined }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: [KEY] }); onDone(); },
  });
  const set = (k: keyof typeof v) => (x: string) => setV(p => ({ ...p, [k]: x }));
  const ready = v.planDocumentId && v.date && v.topic.trim() && v.notes.trim();

  return (
    <Card>
      <CardHeader><div className="flex items-start justify-between"><CardTitle>Record a discussion</CardTitle>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onDone}><X /></Button></div></CardHeader>
      <CardContent>
        {ctx.isPending ? <Loading label="Loading plans…" />
          : ctx.error ? <ErrorBox error={ctx.error} />
          : !plans.length ? <Empty>No approved individual plan where you are the employee or their manager.</Empty>
          : <form className="space-y-3 text-sm" onSubmit={e => { e.preventDefault(); if (ready) mutation.mutate(); }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 sm:col-span-2"><span className="font-medium">Individual plan</span>
                <select className={field} value={v.planDocumentId} onChange={e => setV(p => ({ ...p, planDocumentId: e.target.value, relatesTo: "role" }))}>
                  <option value="">Choose a plan…</option>
                  {plans.map(p => <option key={p.documentId} value={p.documentId}>{person(p.subjectId)} · {p.title}</option>)}
                </select></label>
              <label className="space-y-1"><span className="font-medium">Type</span>
                <select className={field} value={v.kind} onChange={e => set("kind")(e.target.value)}>
                  {Object.entries(KIND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                </select></label>
              <label className="space-y-1"><span className="font-medium">Date</span>
                <input type="date" className={field} max={ctx.data.today} value={v.date} onChange={e => set("date")(e.target.value)} /></label>
              <label className="space-y-1 sm:col-span-2"><span className="font-medium">Relates to</span>
                <select className={field} value={v.relatesTo} onChange={e => set("relatesTo")(e.target.value)} disabled={!plan}>
                  {(plan?.relatesTo ?? [{ key: "role", label: "Role responsibilities" }]).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select></label>
            </div>
            <label className="block space-y-1"><span className="font-medium">Topic</span>
              <input className={field} maxLength={180} value={v.topic} onChange={e => set("topic")(e.target.value)} /></label>
            <label className="block space-y-1"><span className="font-medium">{manager ? "Discussion notes" : "Your input"}</span>
              <textarea className={field} rows={3} maxLength={2500} value={v.notes} onChange={e => set("notes")(e.target.value)} /></label>
            {manager && <label className="block space-y-1"><span className="font-medium">Agreed support (optional)</span>
              <textarea className={field} rows={2} maxLength={2000} value={v.support} onChange={e => set("support")(e.target.value)} /></label>}
            {mutation.error && <ErrorBox error={mutation.error} />}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
              <Button type="submit" disabled={!ready || mutation.isPending}>{mutation.isPending ? "Saving…" : "Save discussion"}</Button>
            </div>
          </form>}
      </CardContent>
    </Card>
  );
}

function CoachingCard({ record: r }: { record: CoachingRecord }) {
  const { accessToken, user } = useAuthStore();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ notes: r.notes, support: r.support, response: r.response });
  const save = useMutation({
    mutationFn: (fn: () => Promise<CoachingRecord>) => fn(),
    onSuccess: next => {
      client.setQueryData<CoachingRecord[]>([KEY, user?.organizationId], rows => rows?.map(x => (x.id === next.id ? next : x)));
      setEditing(false);
    },
  });
  const [kind, tone] = KIND[r.kind];
  const token = accessToken!;
  const canEdit = r.can.editNotes || r.can.respond;

  return (
    <Card size="sm">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap gap-2"><Pill tone={tone}>{kind}</Pill><Pill tone="gray">{r.code}</Pill></div>
        <CardTitle>{r.topic}</CardTitle>
        <CardDescription>{r.subjectName} with {r.reviewerName} · {pretty(r.date)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {editing ? (
          <div className="space-y-2">
            {r.can.editNotes && <>
              <label className="block space-y-1"><span className="font-medium">Notes</span><textarea className={field} rows={3} value={v.notes} onChange={e => setV(p => ({ ...p, notes: e.target.value }))} /></label>
              <label className="block space-y-1"><span className="font-medium">Agreed support</span><textarea className={field} rows={2} value={v.support} onChange={e => setV(p => ({ ...p, support: e.target.value }))} /></label>
            </>}
            {r.can.respond && <label className="block space-y-1"><span className="font-medium">Your response</span><textarea className={field} rows={3} value={v.response} onChange={e => setV(p => ({ ...p, response: e.target.value }))} /></label>}
            <div className="flex gap-2">
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(() => updateCoaching(token, r.id, r.can.editNotes ? { notes: v.notes, support: v.support } : { response: v.response }))}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <dl className="space-y-2">
            <div><dt className="text-muted-foreground">Manager notes</dt><dd className="whitespace-pre-wrap">{r.notes || "—"}</dd></div>
            {r.support && <div><dt className="text-muted-foreground">Agreed support</dt><dd className="whitespace-pre-wrap">{r.support}</dd></div>}
            <div><dt className="text-muted-foreground">Employee response</dt><dd className="whitespace-pre-wrap">{r.response || "—"}</dd></div>
          </dl>
        )}
        <LinkedActions ids={r.linkedActionIds} canLink={r.can.link} busy={save.isPending}
          onLink={id => save.mutate(() => linkCoachingAction(token, r.id, id))}
          onUnlink={id => save.mutate(() => unlinkCoachingAction(token, r.id, id))} />
        {save.error && <ErrorBox error={save.error} />}
        {canEdit && !editing && <Button size="sm" variant="outline" onClick={() => { setV({ notes: r.notes, support: r.support, response: r.response }); setEditing(true); }}>
          {r.can.editNotes ? "Edit my notes" : "Write my response"}</Button>}
      </CardContent>
    </Card>
  );
}
