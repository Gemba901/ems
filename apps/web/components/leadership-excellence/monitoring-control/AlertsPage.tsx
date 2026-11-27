"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, History, Link2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  acknowledgeAlert,
  escalateAlert,
  getAlerts,
  getLinkableActions,
  linkFollowUp,
} from "@/services/leadership-excellence/monitoring-control.service";
import { Empty, ErrorBox, HowTo, Loading, NoteDialog, PageHeader, Pill, pretty, when, useDirectory } from "./shared";
import type { AlertEvent, AlertKind, AlertStatus, AlertStatusFilter, MonitoringAlert } from "./types";
import { NativeSelect } from "@/components/ui/native-select";

const KIND: Record<AlertKind, [string, "red" | "amber" | "navy"]> = {
  MISSING_RESULT: ["Result not reported", "red"],
  VERIFIED_GAP: ["Performance gap", "amber"],
  OVERDUE_ACTION: ["Overdue action", "navy"],
};
const STATUS: Record<AlertStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  ESCALATED: "Escalated",
  FOLLOW_UP_LINKED: "Follow-up linked",
  CLOSED: "Closed",
};
const EVENT: Record<AlertEvent["action"], string> = {
  OPENED: "Opened",
  ACKNOWLEDGED: "Acknowledged",
  ESCALATED: "Escalated",
  FOLLOW_UP_LINKED: "Follow-up linked",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};
const FILTERS: [AlertStatusFilter, string][] = [
  ["ACTIVE", "Open / needs action"],
  ["OPEN", "Open, not yet handled"],
  ["ACKNOWLEDGED", "Acknowledged"],
  ["ESCALATED", "Escalated"],
  ["FOLLOW_UP_LINKED", "Follow-up linked"],
  ["CLOSED", "Closed history"],
];

type Pending = { kind: "acknowledge" | "escalate" | "link"; alert: MonitoringAlert };

/** 05.03 · Performance alerts & follow-up: one issue per KPI or action, handled once. */
export function AlertsPage() {
  const { accessToken, user } = useAuthStore();
  const [status, setStatus] = useState<AlertStatusFilter>("ACTIVE");
  const [pending, setPending] = useState<Pending | null>(null);
  const alerts = useQuery({
    queryKey: ["lex05-alerts", user?.organizationId, status],
    queryFn: ({ signal }) => getAlerts(accessToken!, status, signal),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader code="05.03 · Performance alerts & follow-up" title="Focus on what needs attention."
        lead="One issue per KPI or action, not one repeated message for every overdue day." />
      <HowTo>
        <p><strong className="text-foreground">What is it?</strong> Results not reported by their deadline, verified results below target, and actions past their due date.</p>
        <p><strong className="text-foreground">How to use:</strong> acknowledge an issue with its cause, link the action that will fix it, or escalate it to the owner&apos;s reporting manager.</p>
        <p><strong className="text-foreground">When does it close?</strong> On its own, once the condition is gone: the result is verified, the gap closes, or the action is finished. Alerts are in-app notices, not emails.</p>
      </HowTo>
      <label className="flex w-fit flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Show</span>
        <NativeSelect className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={status} onChange={e => setStatus(e.target.value as AlertStatusFilter)}>
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
      </label>
      {alerts.isPending ? <Loading label="Loading alerts…" />
        : alerts.error ? <ErrorBox error={alerts.error} />
        : !alerts.data.length ? <Empty>No issues in this selection. This does not mean every goal is achieved: check reporting completeness in 05.02.</Empty>
        : <div className="space-y-3">{alerts.data.map(a => <AlertCard key={a.id} alert={a} onAction={kind => setPending({ kind, alert: a })} />)}</div>}
      {pending && <ActionDialog pending={pending} onClose={() => setPending(null)} />}
    </div>
  );
}

function AlertCard({ alert: a, onAction }: { alert: MonitoringAlert; onAction: (kind: Pending["kind"]) => void }) {
  const { person } = useDirectory();
  const [showHistory, setShowHistory] = useState(false);
  const [kind, tone] = KIND[a.kind];
  const closed = a.status === "CLOSED";
  return (
    <Card size="sm">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap gap-2"><Pill tone={tone}>{kind}</Pill><Pill tone={closed ? "green" : "gray"}>{STATUS[a.status]}</Pill></div>
        <CardTitle>{a.title}</CardTitle>
        {a.detail && <CardDescription>{a.detail}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
          <div><dt className="inline">Responsible: </dt><dd className="inline text-foreground">{person(a.ownerId)}</dd></div>
          <div><dt className="inline">Opened: </dt><dd className="inline">{pretty(a.openedAt)}{a.closedAt && ` · closed ${pretty(a.closedAt)}`}</dd></div>
          {a.escalatedToId && <div><dt className="inline">Escalated to: </dt><dd className="inline text-foreground">{person(a.escalatedToId)}</dd></div>}
          {a.comment && <div className="sm:col-span-2"><dt className="inline">Latest response: </dt><dd className="inline text-foreground">{a.comment}</dd></div>}
        </dl>
        {a.linkedActionId && <p className="rounded-md border border-border bg-muted/40 p-2 text-xs">A follow-up action is linked. Its owner updates it in Key Functional Area 4.</p>}
        <div className="flex flex-wrap gap-2">
          {!closed && <>
            <Button size="sm" variant="outline" onClick={() => onAction("acknowledge")}><Check /> Acknowledge</Button>
            <Button size="sm" variant="outline" onClick={() => onAction("link")}><Link2 /> {a.linkedActionId ? "Change linked action" : "Link follow-up action"}</Button>
            {a.status !== "ESCALATED" && <Button size="sm" variant="outline" onClick={() => onAction("escalate")}><ArrowUpRight /> Escalate</Button>}
          </>}
          <Button size="sm" variant="ghost" aria-expanded={showHistory} onClick={() => setShowHistory(v => !v)}><History /> History ({a.events.length})</Button>
        </div>
        {showHistory && (
          <ol className="space-y-1 border-l border-border pl-4 text-xs text-muted-foreground">
            {a.events.map(e => (
              <li key={e.id}><span className="font-medium text-foreground">{EVENT[e.action]}</span> · {when(e.createdAt)} · {e.actorId ? person(e.actorId) : "System"}
                {e.note && <span className="block italic">“{e.note}”</span>}</li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ActionDialog({ pending: { kind, alert }, onClose }: { pending: Pending; onClose: () => void }) {
  const { accessToken, user } = useAuthStore();
  const { person } = useDirectory();
  const client = useQueryClient();
  const [actionId, setActionId] = useState(alert.linkedActionId ?? "");
  const actions = useQuery({
    queryKey: ["lex05-linkable-actions", user?.organizationId],
    queryFn: ({ signal }) => getLinkableActions(accessToken!, signal),
    enabled: !!accessToken && kind === "link",
  });
  const mutation = useMutation({
    mutationFn: (note: string) =>
      kind === "acknowledge" ? acknowledgeAlert(accessToken!, alert.id, note)
        : kind === "escalate" ? escalateAlert(accessToken!, alert.id, note)
        : linkFollowUp(accessToken!, alert.id, actionId, note),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["lex05-alerts"] }); onClose(); },
  });

  const copy = {
    acknowledge: { title: "Acknowledge issue", label: "Cause or response", confirm: "Acknowledge", description: "Records your response. The alert stays open until the condition is gone." },
    escalate: { title: "Escalate issue", label: "Why it needs the manager's attention", confirm: "Escalate", description: `Sends this issue to ${person(alert.ownerId)}'s reporting manager, in the app.` },
    link: { title: "Link follow-up action", label: "What the action will change", confirm: "Link action", description: "Choose the Key Functional Area 4 action that will resolve this issue." },
  }[kind];

  return (
    <NoteDialog {...copy} required busy={mutation.isPending} disabled={kind === "link" && !actionId}
      error={mutation.error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{mutation.error.message}</p>}
      onConfirm={note => mutation.mutate(note)} onClose={onClose}>
      {kind === "link" && (
        actions.isPending ? <Loading label="Loading actions…" />
          : actions.error ? <ErrorBox error={actions.error} />
          : !actions.data.length ? <Empty>No open actions you can link. Add the action to the department plan (Key Functional Area 3); once approved it appears here.</Empty>
          : <label className="block space-y-1 text-sm">
            <span className="font-medium">Action</span>
            <NativeSelect className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={actionId} onChange={e => setActionId(e.target.value)}>
              <option value="">Choose an action…</option>
              {actions.data.map(a => <option key={a.id} value={a.id}>{a.title} · {person(a.ownerId)} · due {pretty(a.dueAt)}</option>)}
            </NativeSelect>
          </label>
      )}
    </NoteDialog>
  );
}
