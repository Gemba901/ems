"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getImprovementActions, recordEffectiveness } from "@/services/leadership-excellence/reviews-development.service";
import { Empty, ErrorBox, HowTo, Loading, NoteDialog, PageHeader, Pill, pretty, useDirectory, when } from "../monitoring-control/shared";
import type { ActionStatus, EffectivenessStatus, ImprovementAction } from "./types";

const EFFECT: Record<EffectivenessStatus, [string, "green" | "amber" | "red"]> = {
  EFFECTIVE: ["Effective", "green"],
  PARTLY_EFFECTIVE: ["Partly effective", "amber"],
  NOT_EFFECTIVE: ["Not effective", "red"],
};
const STATUS: Record<ActionStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed, awaiting check",
  VERIFIED: "Completion checked",
  CANCELLED: "Cancelled",
};
type Filter = "ALL" | "TO_ASSESS" | "ASSESSED" | "OPEN";
const FILTERS: [Filter, string][] = [
  ["TO_ASSESS", "Ready for effectiveness check"],
  ["ASSESSED", "Assessed"],
  ["OPEN", "Not yet checked"],
  ["ALL", "All actions I can see"],
];
const KEY = "lex06-actions";

/** 06.03 · Improvement actions: did a checked action actually help? */
export function ImprovementActionsPage() {
  const { accessToken, user } = useAuthStore();
  const [filter, setFilter] = useState<Filter>("TO_ASSESS");
  const [assessing, setAssessing] = useState<ImprovementAction | null>(null);
  const actions = useQuery({
    queryKey: [KEY, user?.organizationId],
    queryFn: ({ signal }) => getImprovementActions(accessToken!, signal),
    enabled: !!accessToken,
  });
  const rows = (actions.data ?? []).filter(a =>
    filter === "ALL" ? a.status !== "CANCELLED"
      : filter === "TO_ASSESS" ? a.status === "VERIFIED" && !a.effectiveness
      : filter === "ASSESSED" ? !!a.effectiveness
      : a.status !== "VERIFIED" && a.status !== "CANCELLED");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader code="06.03 · Improvement actions" title="Check whether actions worked."
        lead="Completing an action is not the same as solving the problem. Record whether each checked action had the intended effect." />
      <HowTo>
        <p><strong className="text-foreground">What is it?</strong> Actions from Key Functional Area 4 whose completion has been checked. Effectiveness is a separate decision, recorded here.</p>
        <p><strong className="text-foreground">Who assesses?</strong> An independent checker: the person who checked completion, the head of department, the owner&apos;s manager or the goal owner. Never the action owner.</p>
        <p><strong className="text-foreground">What it does not do:</strong> it never changes KPI results. If an action did not work, agree a new action in the plan.</p>
      </HowTo>
      <label className="flex w-fit flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Show</span>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filter} onChange={e => setFilter(e.target.value as Filter)}>
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {actions.isPending ? <Loading label="Loading actions…" />
        : actions.error ? <ErrorBox error={actions.error} />
        : !rows.length ? <Empty>No actions in this selection.</Empty>
        : <div className="space-y-3">{rows.map(a => <ActionCard key={a.id} action={a} onAssess={() => setAssessing(a)} />)}</div>}
      {assessing && <AssessDialog action={assessing} onClose={() => setAssessing(null)} />}
    </div>
  );
}

function ActionCard({ action: a, onAssess }: { action: ImprovementAction; onAssess: () => void }) {
  const { person } = useDirectory();
  const e = a.effectiveness;
  return (
    <Card size="sm">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <Pill tone={a.status === "VERIFIED" ? "green" : "gray"}>{STATUS[a.status]}</Pill>
          {e && <Pill tone={EFFECT[e.status][1]}>{EFFECT[e.status][0]}</Pill>}
          {a.linkedFrom.map(l => <Pill key={l.id} tone="navy">{l.code}</Pill>)}
        </div>
        <CardTitle>{a.title}</CardTitle>
        <CardDescription>{person(a.ownerId)} · due {pretty(a.dueAt)}{a.goalTitle ? ` · ${a.goalTitle}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <dl className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
          {a.expectedResult && <div className="sm:col-span-2"><dt className="inline">Expected result: </dt><dd className="inline text-foreground">{a.expectedResult}</dd></div>}
          {a.evidence && <div className="sm:col-span-2"><dt className="inline">Completion evidence: </dt><dd className="inline text-foreground">{a.evidence}</dd></div>}
          {a.checkedById && <div><dt className="inline">Completion checked by: </dt><dd className="inline text-foreground">{person(a.checkedById)}{a.checkedAt ? `, ${pretty(a.checkedAt)}` : ""}</dd></div>}
        </dl>
        {e && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p><span className="font-medium">{EFFECT[e.status][0]}</span> · assessed by {person(e.assessedById)}, {when(e.assessedAt)}</p>
            <p className="mt-1 whitespace-pre-wrap">{e.note}</p>
            <p className="mt-1 text-muted-foreground">Evidence: {e.evidence}</p>
          </div>
        )}
        {a.canAssess && <Button size="sm" variant={e ? "outline" : "default"} onClick={onAssess}>{e ? "Update assessment" : "Assess effectiveness"}</Button>}
      </CardContent>
    </Card>
  );
}

function AssessDialog({ action: a, onClose }: { action: ImprovementAction; onClose: () => void }) {
  const { accessToken } = useAuthStore();
  const client = useQueryClient();
  const [status, setStatus] = useState<EffectivenessStatus | "">(a.effectiveness?.status ?? "");
  const [evidence, setEvidence] = useState(a.effectiveness?.evidence ?? "");
  const mutation = useMutation({
    mutationFn: (note: string) => recordEffectiveness(accessToken!, a.id, { status: status as EffectivenessStatus, note, evidence: evidence.trim() }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: [KEY] }); onClose(); },
  });
  return (
    <NoteDialog title="Assess effectiveness" label="What changed, and why you reached this decision" required confirm="Save assessment"
      description={<>For <span className="text-foreground">{a.title}</span>. This does not change any KPI result.</>}
      busy={mutation.isPending} disabled={!status || !evidence.trim()}
      error={mutation.error && <ErrorBox error={mutation.error} />}
      onConfirm={note => mutation.mutate(note)} onClose={onClose}>
      <fieldset className="space-y-1 text-sm">
        <legend className="font-medium">Outcome</legend>
        {Object.entries(EFFECT).map(([k, [l]]) => (
          <label key={k} className="flex items-center gap-2"><input type="radio" name="effect" checked={status === k} onChange={() => setStatus(k as EffectivenessStatus)} /> {l}</label>
        ))}
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Evidence used</span>
        <input className="w-full rounded-md border border-input bg-background p-2 text-sm" maxLength={1500} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="e.g. October scrap report" />
      </label>
    </NoteDialog>
  );
}
